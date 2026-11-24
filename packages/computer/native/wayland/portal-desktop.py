import base64
import json
import math
import os
import sys
import threading
import uuid

import gi

gi.require_version('Gst', '1.0')
gi.require_version('Gdk', '4.0')
gi.require_version('Gtk', '4.0')
from gi.repository import Gdk, Gio, GLib, Gst, Gtk

PORTAL = 'org.freedesktop.portal.Desktop'
DESKTOP = '/org/freedesktop/portal/desktop'
REMOTE = 'org.freedesktop.portal.RemoteDesktop'
CAST = 'org.freedesktop.portal.ScreenCast'
SESSION = 'org.freedesktop.portal.Session'
REQUEST = 'org.freedesktop.portal.Request'
LOGIN = 'org.freedesktop.login1'
LOGIN_SESSION = LOGIN + '.Session'
SAVER = 'org.gnome.ScreenSaver'
SAVER_PATH = '/org/gnome/ScreenSaver'
COMMAND_TIMEOUT = 3000


def send(**message):
    print(json.dumps(message, separators=(',', ':')), flush=True)


class Refusal(Exception):
    pass


class InputError(Exception):
    pass


def variant(signature, value):
    return GLib.Variant(signature, value)


def properties(bus, path, interface):
    return bus.call_sync(LOGIN, path, 'org.freedesktop.DBus.Properties', 'GetAll',
                         variant('(s)', (interface,)), None, Gio.DBusCallFlags.NONE,
                         COMMAND_TIMEOUT, None).unpack()[0]


def active_session(bus):
    sessions = bus.call_sync(LOGIN, '/org/freedesktop/login1', LOGIN + '.Manager',
                             'ListSessions', None, None, Gio.DBusCallFlags.NONE,
                             COMMAND_TIMEOUT, None).unpack()[0]
    candidates = []
    for _id, uid, _user, seat, path in sessions:
        if uid != os.getuid() or not seat:
            continue
        state = properties(bus, path, LOGIN_SESSION)
        if (state['Active'] and not state['Remote'] and state['Type'] == 'wayland'
                and state['Class'] == 'user'):
            candidates.append(path)
    if len(candidates) != 1:
        raise Refusal('desktop-unreachable')
    return candidates[0]


class Desktop:
    def __init__(self, loop):
        self.bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        self.system_bus = Gio.bus_get_sync(Gio.BusType.SYSTEM, None)
        self.login_path = active_session(self.system_bus)
        self.loop = loop
        self.session = None
        self.request_path = None
        self.request_wait = None
        self.stream = None
        self.token = None
        self.started = False
        self.connecting = False
        self.active = False
        self.locked = False
        self.screen_inactive = False
        self.pipeline = None
        self.capture_fd = None
        self.first_frame = None
        self.sample = None
        self.logical_size = None
        self.status = None
        self.system_bus.signal_subscribe(
            LOGIN, 'org.freedesktop.DBus.Properties', 'PropertiesChanged', self.login_path,
            LOGIN_SESSION, Gio.DBusSignalFlags.NONE, self.on_login)
        self.bus.signal_subscribe(SAVER, SAVER, 'ActiveChanged', SAVER_PATH, None,
                                  Gio.DBusSignalFlags.NONE, self.on_login)
        self.bus.signal_subscribe(PORTAL, SESSION, 'Closed', None, None,
                                  Gio.DBusSignalFlags.NONE, self.on_closed)
        for element in ('pipewiresrc', 'queue', 'videoconvert', 'videorate', 'jpegenc', 'appsink'):
            if Gst.ElementFactory.find(element) is None:
                raise Refusal('desktop-portal-dependencies')

    def call(self, interface, method, signature, values, path=DESKTOP):
        return self.bus.call_sync(PORTAL, path, interface, method,
                                  variant(signature, values) if signature else None,
                                  None, Gio.DBusCallFlags.NONE, COMMAND_TIMEOUT, None).unpack()

    def set_status(self, status):
        if status != self.status:
            self.status = status
            send(state=status)

    def request(self, interface, method, signature, values, options, timeout=5):
        token = 'request_' + uuid.uuid4().hex
        options['handle_token'] = variant('s', token)
        sender = self.bus.get_unique_name()[1:].replace('.', '_')
        path = f'/org/freedesktop/portal/desktop/request/{sender}/{token}'
        result = None
        waiting = GLib.MainLoop()

        def response(_bus, _sender, _path, _interface, _name, args):
            nonlocal result
            result = args.unpack()
            waiting.quit()

        def expired():
            waiting.quit()
            return GLib.SOURCE_CONTINUE

        subscription = self.bus.signal_subscribe(PORTAL, REQUEST, 'Response', path, None,
                                                 Gio.DBusSignalFlags.NONE, response)
        timer = GLib.timeout_add_seconds(timeout, expired)
        self.request_path = path
        self.request_wait = waiting
        try:
            returned, = self.call(interface, method, signature, (*values, options))
            if returned != path:
                raise Refusal('desktop-portal-ended')
            waiting.run()
            if result is None:
                self.close_remote(path, REQUEST)
                raise Refusal('desktop-consent-required' if method == 'Start' else 'desktop-portal-ended')
            code, data = result
            if code != 0:
                raise Refusal('desktop-consent-required' if method == 'Start' else 'desktop-portal-ended')
            return data
        finally:
            self.request_path = None
            self.request_wait = None
            GLib.source_remove(timer)
            self.bus.signal_unsubscribe(subscription)

    def close_remote(self, path, interface):
        try:
            self.call(interface, 'Close', None, (), path)
        except GLib.Error:
            pass

    def stop_capture(self):
        if self.first_frame is not None:
            GLib.source_remove(self.first_frame)
            self.first_frame = None
        pipeline, self.pipeline = self.pipeline, None
        self.sample = None
        self.stream = None
        self.logical_size = None
        if pipeline is not None:
            pipeline.get_bus().remove_signal_watch()
            pipeline.set_state(Gst.State.NULL)
        if self.capture_fd is not None:
            os.close(self.capture_fd)
            self.capture_fd = None

    def disconnect(self, reason):
        self.set_status(reason)
        session, self.session = self.session, None
        if self.request_path is not None:
            self.close_remote(self.request_path, REQUEST)
            self.request_wait.quit()
        self.stop_capture()
        if session is not None:
            self.close_remote(session, SESSION)

    def refresh_login(self):
        state = properties(self.system_bus, self.login_path, LOGIN_SESSION)
        was_inactive = self.locked or self.screen_inactive
        self.active = state['Active'] and state['Type'] == 'wayland'
        self.locked = state['LockedHint']
        self.screen_inactive, = self.bus.call_sync(
            SAVER, SAVER_PATH, SAVER, 'GetActive', None, None, Gio.DBusCallFlags.NONE,
            COMMAND_TIMEOUT, None).unpack()
        if not self.active:
            self.disconnect('desktop-unreachable')
        elif self.locked:
            self.disconnect('desktop-locked')
        elif self.screen_inactive:
            self.disconnect('desktop-screen-inactive')
        elif was_inactive and self.started:
            if self.token is None:
                self.set_status('desktop-consent-required')
            elif not self.connecting:
                GLib.idle_add(self.connect, True)

    def on_login(self, *_args):
        try:
            self.refresh_login()
        except GLib.Error:
            self.disconnect('desktop-unreachable')

    def on_closed(self, _bus, _sender, path, *_args):
        if path != self.session:
            return
        self.session = None
        self.capture_ended()

    def capture_ended(self):
        self.disconnect('desktop-restoring')
        GLib.timeout_add(500, self.verify_portal_end)

    def verify_portal_end(self):
        try:
            if self.status == 'desktop-restoring' and self.session is None and not self.connecting:
                self.refresh_login()
                if self.active and not self.locked and not self.screen_inactive:
                    self.disconnect('desktop-portal-ended')
        except GLib.Error:
            self.disconnect('desktop-unreachable')
        return GLib.SOURCE_REMOVE

    def connect(self, restoring=False):
        if self.connecting or self.session is not None:
            return GLib.SOURCE_REMOVE
        self.connecting = True
        try:
            self.refresh_login()
            if not self.active or self.locked or self.screen_inactive:
                return GLib.SOURCE_REMOVE
            self.set_status('desktop-restoring' if restoring else 'desktop-consent-pending')
            session_token = 'session_' + uuid.uuid4().hex
            created = self.request(REMOTE, 'CreateSession', '(a{sv})', (),
                                   {'session_handle_token': variant('s', session_token)})
            self.session = created['session_handle']
            selected_session = self.session
            select = {'types': variant('u', 3), 'persist_mode': variant('u', 2)}
            if self.token is not None:
                select['restore_token'] = variant('s', self.token)
            self.request(REMOTE, 'SelectDevices', '(oa{sv})', (selected_session,), select)
            self.request(CAST, 'SelectSources', '(oa{sv})', (selected_session,), {
                'types': variant('u', 1), 'multiple': variant('b', False),
                'cursor_mode': variant('u', 2),
            })
            reply = self.request(REMOTE, 'Start', '(osa{sv})', (selected_session, ''), {}, 75)
            if self.session != selected_session or not self.active or self.locked or self.screen_inactive:
                raise Refusal('desktop-unreachable')
            streams = reply.get('streams', [])
            if len(streams) != 1 or reply.get('devices', 0) & 3 != 3:
                raise Refusal('desktop-consent-required')
            if not reply.get('restore_token'):
                raise Refusal('desktop-consent-required')
            self.token = reply['restore_token']
            send(token=self.token)
            self.stream, metadata = streams[0]
            self.logical_size = metadata.get('size')
            self.start_capture()
        except Refusal as error:
            self.disconnect(self.inactive_reason() or str(error))
        except (GLib.Error, OSError, KeyError, ValueError):
            self.disconnect(self.inactive_reason() or 'desktop-portal-ended')
        finally:
            self.connecting = False
            if (self.status in ('desktop-locked', 'desktop-screen-inactive') and self.active
                    and not self.locked and not self.screen_inactive and self.token):
                GLib.idle_add(self.connect, True)
        return GLib.SOURCE_REMOVE

    def inactive_reason(self):
        if self.locked:
            return 'desktop-locked'
        if self.screen_inactive:
            return 'desktop-screen-inactive'
        return None

    def start_capture(self):
        reply, descriptors = self.bus.call_with_unix_fd_list_sync(
            PORTAL, DESKTOP, CAST, 'OpenPipeWireRemote', variant('(oa{sv})', (self.session, {})),
            None, Gio.DBusCallFlags.NONE, COMMAND_TIMEOUT, None, None)
        self.capture_fd = descriptors.get(reply.unpack()[0])
        pipeline = Gst.parse_launch(
            f'pipewiresrc fd={self.capture_fd} path={self.stream} keepalive-time=500 '
            '! queue leaky=downstream max-size-buffers=1 max-size-bytes=0 max-size-time=0 '
            '! videorate drop-only=true max-rate=5 ! videoconvert ! jpegenc quality=75 '
            '! appsink name=frames max-buffers=1 drop=true sync=false emit-signals=true')
        self.pipeline = pipeline
        bus = pipeline.get_bus()
        bus.add_signal_watch()
        bus.connect('message::error', self.on_capture_ended)
        bus.connect('message::eos', self.on_capture_ended)
        pipeline.get_by_name('frames').connect('new-sample', self.on_sample, pipeline)
        self.first_frame = GLib.timeout_add_seconds(8, self.capture_timed_out)
        if pipeline.set_state(Gst.State.PLAYING) == Gst.StateChangeReturn.FAILURE:
            raise Refusal('desktop-portal-ended')

    def capture_timed_out(self):
        self.first_frame = None
        self.capture_ended()
        return GLib.SOURCE_REMOVE

    def on_capture_ended(self, _bus, _message):
        if self.pipeline is not None:
            self.capture_ended()

    def on_sample(self, sink, pipeline):
        sample = sink.emit('pull-sample')
        if sample is not None:
            self.sample = (pipeline, sample)
            if self.first_frame is not None:
                GLib.idle_add(self.ready, pipeline)
        return Gst.FlowReturn.OK

    def ready(self, pipeline):
        if self.pipeline is pipeline and self.first_frame is not None:
            GLib.source_remove(self.first_frame)
            self.first_frame = None
            self.set_status('ready')
        return GLib.SOURCE_REMOVE

    def frame(self):
        sample = self.sample
        if sample is None or sample[0] is not self.pipeline:
            raise Refusal('desktop-portal-ended')
        sample = sample[1]
        structure = sample.get_caps().get_structure(0)
        return sample.get_buffer(), structure.get_value('width'), structure.get_value('height')

    def notify(self, method, signature, *values):
        self.call(REMOTE, method, f'(oa{{sv}}{signature})', (self.session, {}, *values))

    def point(self, x, y):
        _buffer, width, height = self.frame()
        if not (0 <= x < width and 0 <= y < height):
            raise ValueError('Coordinates are outside the shared screen.')
        logical_width, logical_height = self.logical_size or (width, height)
        self.notify('NotifyPointerMotionAbsolute', 'udd', self.stream,
                    x * logical_width / width, y * logical_height / height)

    def key(self, keysym, pressed):
        self.notify('NotifyKeyboardKeysym', 'iu', keysym, int(pressed))

    def press_keys(self, keysyms):
        pressed = []
        try:
            for keysym in keysyms:
                pressed.append(keysym)
                self.key(keysym, True)
        finally:
            release_failed = False
            for keysym in reversed(pressed):
                try:
                    self.key(keysym, False)
                except GLib.Error:
                    release_failed = True
            if release_failed:
                self.disconnect('desktop-portal-ended')
                raise Refusal('desktop-portal-ended')

    def text_keys(self, text):
        if not text:
            return []
        Gdk.set_allowed_backends('wayland')
        display = Gdk.Display.get_default() if Gtk.init_check() else None
        seat = display.get_default_seat() if display is not None else None
        keyboard = seat.get_keyboard() if seat is not None else None
        if keyboard is None:
            raise InputError('Could not read the desktop keyboard layout. Try again.')
        group = keyboard.get_active_layout_index()
        controls = {'\n': Gdk.KEY_Return, '\t': Gdk.KEY_Tab}
        keysyms = [controls[char] if char in controls else Gdk.unicode_to_keyval(ord(char))
                   for char in text]
        for keysym in set(keysyms):
            mapped, keys = display.map_keyval(keysym)
            if not mapped or not any(key.group == group and key.level <= 2 for key in keys):
                raise InputError('The desktop keyboard layout cannot type some of this text. Change the layout or enter the text on the desktop.')
        return keysyms

    def execute(self, method, args):
        if self.status != 'ready' or self.session is None:
            raise Refusal(self.status or 'desktop-portal-ended')
        if method in ('get_desktop_state', 'get_screen_size'):
            buffer, width, height = self.frame()
            info = {'width': width, 'height': height}
            if method == 'get_desktop_state':
                if buffer.get_size() > 4_000_000:
                    raise ValueError('The desktop frame exceeds the capture limit.')
                data = buffer.extract_dup(0, buffer.get_size())
                info['image'] = base64.b64encode(data).decode('ascii')
            return info
        if method == 'click':
            button = {'left': 272, 'right': 273, 'middle': 274}[args.get('button', 'left')]
            self.point(args['x'], args['y'])
            for _ in range(args.get('count', 1)):
                self.notify('NotifyPointerButton', 'iu', button, 1)
                self.notify('NotifyPointerButton', 'iu', button, 0)
        elif method == 'scroll':
            if 'x' in args and 'y' in args:
                self.point(args['x'], args['y'])
            axis, direction = {'up': (0, -1), 'down': (0, 1),
                               'left': (1, -1), 'right': (1, 1)}[args['direction']]
            self.notify('NotifyPointerAxisDiscrete', 'ui', axis,
                        direction * math.ceil(args.get('amount', 3)))
        elif method == 'type_text':
            for keysym in self.text_keys(args['text']):
                self.press_keys((keysym,))
        else:
            labels = args['keys'] if method == 'hotkey' else [args['key']]
            aliases = {'ctrl': 'Control_L', 'control': 'Control_L', 'cmd': 'Super_L',
                       'meta': 'Super_L', 'super': 'Super_L', 'alt': 'Alt_L',
                       'shift': 'Shift_L', 'enter': 'Return', 'return': 'Return', 'space': 'space',
                       'arrowup': 'Up', 'arrowdown': 'Down', 'arrowleft': 'Left',
                       'arrowright': 'Right', 'pageup': 'Page_Up', 'pagedown': 'Page_Down',
                       'backspace': 'BackSpace', 'esc': 'Escape', 'escape': 'Escape',
                       'tab': 'Tab', 'up': 'Up', 'down': 'Down', 'left': 'Left', 'right': 'Right'}
            keysyms = [Gdk.keyval_from_name(aliases.get(key.lower(), key)
                       if key != 'delete' else 'BackSpace') for key in labels]
            if any(keysym in (0, Gdk.KEY_VoidSymbol) for keysym in keysyms):
                raise ValueError('The desktop does not recognize that key.')
            self.press_keys(keysyms)
        return {}

    def receive(self, command):
        if command['method'] == 'start':
            self.started = True
            if self.token is None:
                self.token = command.get('token')
            GLib.idle_add(self.connect, self.token is not None)
            return GLib.SOURCE_REMOVE
        request = command['id']
        try:
            send(id=request, value=self.execute(command['method'], command['args']))
        except Refusal as error:
            send(id=request, refusal=str(error))
        except InputError as error:
            send(id=request, error=str(error))
        except (ValueError, KeyError, TypeError):
            send(id=request, error='The desktop could not apply these input arguments.')
        except GLib.Error:
            send(id=request, error='The desktop ended or refused the input. Observe it again before retrying.')
        return GLib.SOURCE_REMOVE


def read_commands(desktop):
    for line in sys.stdin:
        GLib.idle_add(desktop.receive, json.loads(line))
    GLib.idle_add(desktop.loop.quit)


def main():
    Gst.init(None)
    loop = GLib.MainLoop()
    try:
        desktop = Desktop(loop)
    except Refusal as error:
        send(state=str(error))
        return
    except GLib.Error:
        send(state='desktop-unreachable')
        return
    threading.Thread(target=read_commands, args=(desktop,), daemon=True).start()
    loop.run()


if __name__ == '__main__':
    main()
