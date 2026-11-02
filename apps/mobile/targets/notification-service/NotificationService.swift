import Intents
import UserNotifications

/// Turns a Bot push into a Communication Notification: the Bot is the sender with its avatar,
/// and a group Channel is the conversation with the Channel avatar. The avatars are PNGs the app
/// caches in the shared App Group (src/host/notification-avatars.ts). Anything missing leaves the
/// notification as the Host sent it.
class NotificationService: UNNotificationServiceExtension {
  private var deliver: ((UNNotificationContent) -> Void)?
  private var original: UNNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    deliver = contentHandler
    original = request.content
    let content = (try? ConversationContent.make(from: request.content)) ?? request.content
    deliver = nil
    contentHandler(content)
  }

  override func serviceExtensionTimeWillExpire() {
    if let deliver, let original { deliver(original) }
    deliver = nil
  }
}

enum ConversationContent {
  private static let suffix = ".notification-service"

  static func make(from content: UNNotificationContent) throws -> UNNotificationContent? {
    guard
      let data = content.userInfo["body"] as? [String: Any],
      let host = data["hostId"] as? String, !host.isEmpty,
      let slug = data["botSlug"] as? String, !slug.isEmpty,
      let sender = data["sender"] as? String, !sender.isEmpty
    else { return nil }
    let channel = (data["channelId"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    let group = (data["group"] as? String).flatMap { $0.isEmpty ? nil : $0 }

    let botKey = "bot:\(host):\(slug)"
    let bot = INPerson(
      personHandle: INPersonHandle(value: botKey, type: .unknown),
      nameComponents: nil,
      displayName: sender,
      image: image(host: host, key: "bot-\(slug)"),
      contactIdentifier: nil,
      customIdentifier: botKey
    )
    let intent = INSendMessageIntent(
      recipients: nil,
      outgoingMessageType: .outgoingMessageText,
      content: nil,
      speakableGroupName: group.map { INSpeakableString(spokenPhrase: "#\($0)") },
      conversationIdentifier: "\(host):\(channel ?? botKey)",
      serviceName: nil,
      sender: bot,
      attachments: nil
    )
    if group != nil {
      let metadata = INSendMessageIntentDonationMetadata()
      metadata.recipientCount = 2
      intent.donationMetadata = metadata
      if let channel, let groupImage = image(host: host, key: "channel-\(channel)") {
        intent.setImage(groupImage, forParameterNamed: \.speakableGroupName)
      }
    }

    let interaction = INInteraction(intent: intent, response: nil)
    interaction.direction = .incoming
    interaction.donate(completion: nil)

    guard let mutable = content.mutableCopy() as? UNMutableNotificationContent else { return nil }
    if let text = data["text"] as? String, !text.isEmpty { mutable.body = text }
    return try mutable.updating(from: intent)
  }

  static func safe(_ value: String) -> String {
    String(value.unicodeScalars.map { scalar in
      let kept = scalar.isASCII
        && (CharacterSet.alphanumerics.contains(scalar) || "._-".unicodeScalars.contains(scalar))
      return kept ? Character(scalar) : "_"
    })
  }

  private static func image(host: String, key: String) -> INImage? {
    guard
      let bundle = Bundle.main.bundleIdentifier, bundle.hasSuffix(suffix),
      let root = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: "group.\(bundle.dropLast(suffix.count))")
    else { return nil }
    let file = root
      .appendingPathComponent("notification-avatars", isDirectory: true)
      .appendingPathComponent(safe(host), isDirectory: true)
      .appendingPathComponent("\(safe(key)).png")
    guard let bytes = try? Data(contentsOf: file) else { return nil }
    return INImage(imageData: bytes)
  }
}
