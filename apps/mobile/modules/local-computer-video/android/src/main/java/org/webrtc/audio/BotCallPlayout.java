package org.webrtc.audio;

import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;

/**
 * The pinned M144 SDK exposes audioAttributes on its package-private output class.
 * Call only between PeerConnection.setAudioPlayout(false) and setAudioPlayout(true):
 * InitPlayout reads these attributes when it creates the replacement AudioTrack.
 * No reflection, second renderer, or second peer is involved.
 */
public final class BotCallPlayout {
  private BotCallPlayout() {}

  public static void setInput(JavaAudioDeviceModule module, AudioDeviceInfo device) {
    module.audioInput.setPreferredDevice(device);
  }

  public static void setAttributes(JavaAudioDeviceModule module, AudioAttributes attributes) {
    module.audioOutput.audioAttributes = attributes;
  }
}
