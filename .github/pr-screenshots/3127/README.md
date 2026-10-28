# Android Profile paging evidence (initial review)

Both captures are physical Android 16, 1220x2712, Chinese, light appearance, font scale1.0/density480. Same synthetic A Profile and Memory grid; halfway through the same six-second native left drag, sampled after three seconds. Top124pixels deterministically mask the personal status bar. Originals remain private; no product pixels were generated or retouched.

- b-l.png: main f70af356d052014fe12b67aeab3c18c1acb979e5, arm64 development-id Release APK 4ef0f6630d51e2244f4c7cba3ff0e9a0da9ec946e82a176fbe238894eab7d26a. Body stays stationary until release.
- a-l.png: implementation fbef9eb2132de0b777e929ea9c8a72e22b8f218d, arm64 Debug native client from 07bf48938474 with unchanged native inputs. Both cached bodies follow the finger; shared header/strip stay horizontally fixed. Files retains its chosen Files segment on revisit. This initial pair discloses different native build variants; it demonstrates the interaction, not comparative FPS.

The first code commit also has actual cache and reverse-drag phone checks (one Files subscription across revisits). Final Release qualification, rapid-selection follow-up and the extended matrix are still in progress. iOS native QA belongs to the Mac engineer. These images do not qualify later code automatically; final results will retain their exact source/build provenance.
