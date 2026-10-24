# The pinned AAR has no consumer rules. Its JNI bindings resolve Java names at runtime.
-keepclasseswithmembernames,includedescriptorclasses class org.webrtc.** {
    native <methods>;
}
-keepclasseswithmembernames,includedescriptorclasses class org.jni_zero.** {
    native <methods>;
}
-keepclasseswithmembers,includedescriptorclasses class org.webrtc.** {
    @org.webrtc.CalledByNative <methods>;
}
-keepclasseswithmembers,includedescriptorclasses class org.webrtc.** {
    @org.webrtc.CalledByNativeUnchecked <methods>;
}
-keepclasseswithmembers,includedescriptorclasses class org.jni_zero.** {
    @org.jni_zero.CalledByNative <methods>;
}
-keepclasseswithmembers,includedescriptorclasses class org.jni_zero.** {
    @org.jni_zero.CalledByNativeUnchecked <methods>;
}
