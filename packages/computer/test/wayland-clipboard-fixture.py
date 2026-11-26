import importlib.util
import os
import sys
from types import ModuleType, SimpleNamespace
from unittest import TestCase, main


class Loop:
    def run(self):
        self.deliver()

    def quit(self):
        pass


gi = ModuleType('gi')
gi.require_version = lambda *_: None
repository = ModuleType('gi.repository')
repository.Gdk = SimpleNamespace(KEY_Control_L=65507, KEY_v=118)
repository.Gio = SimpleNamespace(DBusCallFlags=SimpleNamespace(NONE=0))
repository.GLib = SimpleNamespace(
    Error=type('DBusError', (Exception,), {}), MainLoop=Loop,
    Variant=lambda _signature, value: value, SOURCE_CONTINUE=True,
    timeout_add=lambda *_: 1, source_remove=lambda *_: None,
)
repository.Gst = SimpleNamespace()
sys.modules['gi'] = gi
sys.modules['gi.repository'] = repository
spec = importlib.util.spec_from_file_location('portal_desktop', sys.argv.pop(1))
portal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(portal)


class ClipboardInput(TestCase):
    def setUp(self):
        self.desktop = portal.Desktop.__new__(portal.Desktop)
        self.desktop.session = '/session'
        self.desktop.status = 'ready'
        self.desktop.clipboard_enabled = True
        self.desktop.paste = None
        self.calls = []
        self.desktop.call = lambda interface, method, _signature, args: self.calls.append(
            (interface, method, args))
        self.desktop.press_keys = lambda keys: self.calls.append(('keys', keys))

    def type_text(self):
        return self.desktop.execute('type_text', {'text': 'A你B-5135 🙂'})

    def test_pastes_exact_utf8_and_clears_its_offer(self):
        read_fd, write_fd = os.pipe()
        with os.fdopen(read_fd, 'rb') as reader:
            def provide_fd(*_):
                return SimpleNamespace(unpack=lambda: (0,)), SimpleNamespace(get=lambda _: write_fd)

            self.desktop.bus = SimpleNamespace(call_with_unix_fd_list_sync=provide_fd)
            def transfer(loop):
                self.desktop.on_selection_transfer(None, None, None, None, None, SimpleNamespace(
                    unpack=lambda: ('/session', 'text/plain;charset=utf-8', 42)))

            Loop.deliver = transfer
            self.assertEqual(self.type_text(), {})
            self.assertEqual(reader.read().decode('utf-8'), 'A你B-5135 🙂')
        self.assertEqual(self.calls, [
            (portal.CLIPBOARD, 'SetSelection', ('/session', {'mime_types': portal.TEXT_TYPES})),
            ('keys', (65507, 118)),
            (portal.CLIPBOARD, 'SelectionWriteDone', ('/session', 42, True)),
            (portal.CLIPBOARD, 'SetSelection', ('/session', {})),
        ])
        self.assertIsNone(self.desktop.paste)

    def test_refuses_missing_clipboard_grant_before_sending_input(self):
        self.desktop.clipboard_enabled = False
        with self.assertRaisesRegex(portal.InputError, 'clipboard permission'):
            self.type_text()
        self.assertEqual(self.calls, [])

    def test_refuses_unconsumed_paste_and_clears_its_offer(self):
        Loop.deliver = lambda _loop: None
        with self.assertRaisesRegex(portal.InputError, 'did not request'):
            self.type_text()
        self.assertEqual(self.calls[-1], (portal.CLIPBOARD, 'SetSelection', ('/session', {})))
        self.assertIsNone(self.desktop.paste)


if __name__ == '__main__':
    main()
