import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const moduleRoot = new URL('../modules/local-computer-video/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, moduleRoot), 'utf8');

describe('Android call camera (#3498)', () => {
  it('registers the CallCamera module and declares the camera permission', () => {
    const config = JSON.parse(read('expo-module.config.json')) as {
      android: { modules: string[] };
    };
    expect(config.android.modules).toContain('expo.modules.localcomputervideo.CallCameraModule');
    expect(read('android/src/main/AndroidManifest.xml')).toContain('android.permission.CAMERA');
  });

  it('exposes the iPhone call-camera contract instead of a second JS path', () => {
    const module = read(
      'android/src/main/java/expo/modules/localcomputervideo/CallCameraModule.kt',
    );
    expect(module).toContain('Name("CallCamera")');
    for (const event of ['onCallCameraThumb', 'onCallCameraState']) {
      expect(module).toContain(event);
    }
    for (const method of ['callCameraStart', 'callCameraKeyframe', 'callCameraStop']) {
      expect(module).toContain(method);
    }
    expect(module).toContain('View(CallCameraView::class)');
  });

  it('captures CameraX 720p, the test video and bounded JPEG keyframes', () => {
    const camera = read('android/src/main/java/expo/modules/localcomputervideo/CallCamera.kt');
    expect(camera).toContain('ImageAnalysis.Builder()');
    expect(camera).toContain('Size(1280, 720)');
    expect(camera).toContain('setOutputImageRotationEnabled(true)');
    expect(camera).toContain('MediaMetadataRetriever');
    expect(
      read('android/src/main/java/expo/modules/localcomputervideo/CallCameraFrames.kt'),
    ).toContain('jpegQualities = intArrayOf(80, 60, 45)');
    expect(read('android/build.gradle')).toContain('camera-view');
  });

  it('re-registers the self-preview when the view re-attaches', () => {
    const view = read('android/src/main/java/expo/modules/localcomputervideo/CallCameraView.kt');
    expect(view).toContain('override fun onAttachedToWindow()');
    expect(view).toContain('CallCamera.attach(this)');
    expect(view).toContain('override fun onDetachedFromWindow()');
    expect(view).toContain('CallCamera.detach(this)');
  });

  it('keeps the call alive while the camera permission dialog pauses the activity', () => {
    const host = read(
      'android/src/main/java/expo/modules/localcomputervideo/LocalComputerVideoModule.kt',
    );
    expect(host).toContain('if (!CallCamera.askingPermission)');
  });
});
