# Native menu (iOS)

A local Expo view wrapping UIKit UIButton/UIMenu. Expo UI SwiftUI Menu has no menu-opening callback in the pinned SDK. UIKit menuActionTriggered supplies the semantic event before presentation, including native activation, without adding touch recognizers or changing tap into long press. JavaScript owns preference-controlled haptics and picker/navigation actions. UIKit owns ordering, highlighting, scrolling, dismissal, accessibility and glass/fallback rendering.

The view only emits onOpen and onSelect; it never opens files, creates Bots or owns user preferences. Identical item updates keep the same menu during composer re-renders. Disabled controls neither emit feedback nor select an action. Stable item IDs are UIAction identifiers; the native menu exposes human labels to accessibility, while the trigger has its explicit test ID.

Native inputs changed: rebuild before loading this JS. Android uses the existing Expo UI Material 3 dropdown and needs no new native module.

Primary API: https://developer.apple.com/documentation/uikit/uicontrol/event/menuactiontriggered
