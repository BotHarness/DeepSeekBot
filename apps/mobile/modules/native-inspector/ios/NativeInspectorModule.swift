import ExpoModulesCore
import SwiftUI

public final class NativeInspectorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeInspector")
    View(InspectorView.self)
  }
}

final class InspectorProps: ExpoSwiftUI.ViewProps {
  @Field var isPresented = false
  @Field var title = ""
  @Field var closeLabel = ""
  @Field var resetLabel = ""
  var onIsPresentedChange = EventDispatcher()
  var onReset = EventDispatcher()
}

struct InspectorView: ExpoSwiftUI.View {
  @ObservedObject var props: InspectorProps

  private var presented: Binding<Bool> {
    Binding(get: { props.isPresented }, set: { value in
      props.onIsPresentedChange(["isPresented": value])
    })
  }

  @ViewBuilder var body: some View {
    if #available(iOS 17.0, *) {
      Color.clear
        .inspector(isPresented: presented) { panel }
    } else {
      Color.clear
        .sheet(isPresented: presented) { panel }
    }
  }

  private var panel: some View {
    NavigationStack {
      child(at: 0)
        .navigationTitle(props.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button { presented.wrappedValue = false } label: {
              Image(systemName: "xmark")
            }
            .accessibilityLabel(props.closeLabel)
            .accessibilityIdentifier("activity-filter-close")
          }
          ToolbarItem(placement: .primaryAction) {
            Button(props.resetLabel) { props.onReset([:]) }
              .accessibilityIdentifier("activity-filter-reset")
          }
        }
    }
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
  }

  @ViewBuilder private func child(at index: Int) -> some View {
    if let children = props.children, children.indices.contains(index) {
      let content: any View = children[index].childView
      AnyView(content)
    }
  }
}
