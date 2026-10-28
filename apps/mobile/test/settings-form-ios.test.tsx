// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

type Modifier = { kind: string; value?: unknown };
type NativeProps = {
  children?: ReactNode;
  label?: ReactNode;
  icon?: ReactNode;
  footer?: ReactNode;
  title?: string;
  systemImage?: string;
  systemName?: string;
  testID?: string;
  role?: string;
  isOn?: boolean;
  selection?: string;
  modifiers?: Modifier[];
  onPress?(): void;
  onIsOnChange?(value: boolean): void;
  onSelectionChange?(value: string): void;
};

vi.mock("react-native", () => import("./react-native-shim"));
vi.mock("react-native-svg", () => ({ default: () => null, Path: () => null }));
vi.mock("expo-symbols", () => ({ SymbolView: () => <i data-rn-symbol /> }));
vi.mock(
  "../src/ui/primitives/settings-form-row",
  () => import("../src/ui/primitives/settings-form-row.ios"),
);
vi.mock("@expo/ui/swift-ui/modifiers", () =>
  Object.fromEntries(
    [
      "accessibilityAddTraits",
      "accessibilityElement",
      "accessibilityLabel",
      "accessibilityValue",
      "bold",
      "buttonStyle",
      "disabled",
      "font",
      "foregroundStyle",
      "frame",
      "listRowBackground",
      "listRowInsets",
      "monospacedDigit",
      "pickerStyle",
      "scrollContentBackground",
      "tag",
      "tint",
    ].map((kind) => [kind, (value: unknown) => ({ kind, value })]),
  ),
);
vi.mock("@expo/ui/swift-ui", () => {
  const find = (props: NativeProps, kind: string) =>
    props.modifiers?.find((modifier) => modifier.kind === kind)?.value;
  const a11y = (props: NativeProps) => ({
    "aria-label": find(props, "accessibilityLabel") as string | undefined,
    "data-value": find(props, "accessibilityValue") as string | undefined,
    "data-traits": JSON.stringify(find(props, "accessibilityAddTraits") ?? []),
  });
  const box =
    (tag: string) =>
    ({ children }: NativeProps) => <div data-native={tag}>{children}</div>;
  return {
    Host: box("host"),
    Form: (props: NativeProps) => (
      <div data-native="form" data-tint={JSON.stringify(find(props, "tint"))}>
        {props.children}
      </div>
    ),
    Section: (props: NativeProps) => (
      <section data-native="section">
        {props.title === undefined ? null : <h2>{props.title}</h2>}
        {props.children}
        {props.footer === undefined ? null : <footer>{props.footer}</footer>}
      </section>
    ),
    HStack: box("hstack"),
    VStack: (props: NativeProps) => (
      <div
        data-native="vstack"
        data-combine={
          find(props, "accessibilityElement") === "combine" ? "true" : undefined
        }
        data-insets={JSON.stringify(find(props, "listRowInsets") ?? null)}
        {...a11y(props)}
      >
        {props.children}
      </div>
    ),
    Spacer: () => null,
    RNHostView: ({ children }: NativeProps) => (
      <div data-native="rn-host">{children}</div>
    ),
    ProgressView: () => <progress />,
    Text: (props: NativeProps) => {
      const value = find(props, "tag") as string | undefined;
      return value === undefined ? (
        <span data-native="text">{props.children}</span>
      ) : (
        <option value={value}>{props.children}</option>
      );
    },
    Image: (props: NativeProps) => <i data-symbol={props.systemName} />,
    Label: (props: NativeProps) => (
      <span data-native="label" data-system-image={props.systemImage}>
        {props.icon}
        {props.title}
        {props.children}
      </span>
    ),
    LabeledContent: (props: NativeProps) => (
      <span data-native="labeled-content">
        {props.label}
        <b data-native="value">{props.children}</b>
      </span>
    ),
    Button: (props: NativeProps) => (
      <button
        data-testid={props.testID}
        data-role={props.role}
        data-tint={JSON.stringify(find(props, "tint") ?? null)}
        onClick={props.onPress}
        {...a11y(props)}
      >
        {props.children}
      </button>
    ),
    Toggle: (props: NativeProps) => (
      <label data-native="toggle">
        {props.children}
        <input
          type="checkbox"
          data-testid={props.testID}
          checked={props.isOn}
          disabled={find(props, "disabled") === true}
          aria-label={find(props, "accessibilityLabel") as string}
          onChange={(event) => props.onIsOnChange?.(event.target.checked)}
        />
      </label>
    ),
    Picker: (props: NativeProps) => (
      <div
        data-native="picker"
        data-testid={props.testID}
        data-style={JSON.stringify(find(props, "pickerStyle"))}
      >
        {props.label}
        <select
          value={props.selection}
          onChange={(event) => props.onSelectionChange?.(event.target.value)}
        >
          {props.children}
        </select>
      </div>
    ),
    Menu: box("menu"),
  };
});

import { DesignThemeProvider } from "../src/ui/design/theme";
import { LoadingIndicator } from "../src/ui/primitives/loading-indicator";
import { PreferenceRow } from "../src/ui/primitives/preference-row.ios";
import { RowIcon } from "../src/ui/primitives/row-icon";
import {
  SettingsForm,
  SettingsFormItem,
} from "../src/ui/primitives/settings-form.ios";
import {
  SettingsRow,
  SettingsSection,
} from "../src/ui/primitives/settings-row";
import { Text } from "../src/ui/primitives/text";
import { Toggle } from "../src/ui/primitives/toggle";
import { CheckIcon } from "../src/ui/shell/icons";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let unmount: (() => void) | undefined;
afterEach(() => act(() => unmount?.()));

async function render(node: ReactNode) {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <DesignThemeProvider appearance={{ scheme: "light" }}>
        {node}
      </DesignThemeProvider>,
    ),
  );
  unmount = () => root.unmount();
  return host;
}

it("renders sections as form sections with header and footer text", async () => {
  const host = await render(
    <SettingsForm testID="settings">
      <SettingsSection title="Interface" footer="Saved on this phone">
        <SettingsRow title="Haptic feedback" />
      </SettingsSection>
    </SettingsForm>,
  );
  const form = host.querySelector('[data-native="form"]')!;
  expect(JSON.parse(form.getAttribute("data-tint")!)).toMatch(/^#/);
  const section = form.querySelector('[data-native="section"]')!;
  expect(section.querySelector("h2")!.textContent).toBe("Interface");
  expect(section.querySelector("footer")!.textContent).toBe(
    "Saved on this phone",
  );
  const row = section.querySelector('[data-combine="true"]')!;
  expect(row.getAttribute("aria-label")).toBe("Haptic feedback");
});

it("pushes through the caller with an SF Symbol label and the system chevron", async () => {
  const open = vi.fn();
  const host = await render(
    <SettingsForm>
      <SettingsSection title="Connections">
        <SettingsRow
          title="Notifications"
          detail="On"
          leading={<RowIcon name="notifications" />}
          disclosure
          testID="settings-notifications"
          onPress={open}
        />
      </SettingsSection>
    </SettingsForm>,
  );
  const button = host.querySelector<HTMLButtonElement>(
    '[data-testid="settings-notifications"]',
  )!;
  expect(button.querySelector('[data-symbol="bell"]')).not.toBeNull();
  expect(button.querySelector('[data-symbol="chevron.right"]')).not.toBeNull();
  expect(button.querySelector("[data-rn-symbol]")).toBeNull();
  expect(button.getAttribute("aria-label")).toBe("Notifications");
  expect(button.getAttribute("data-value")).toBe("On");
  expect(JSON.parse(button.getAttribute("data-tint")!)).toMatch(/^#/);
  await act(async () => button.click());
  expect(open).toHaveBeenCalledOnce();
});

it("turns a trailing Toggle into a native SwiftUI toggle with the row as its label", async () => {
  const change = vi.fn();
  const host = await render(
    <SettingsForm>
      <SettingsSection>
        <SettingsRow
          title="Delivery receipts"
          detail="Show when a Bot has read it"
          trailing={
            <Toggle
              testID="delivery-receipt-toggle"
              label="Delivery receipts"
              value
              onChange={change}
            />
          }
        />
      </SettingsSection>
    </SettingsForm>,
  );
  const toggle = host.querySelector('[data-native="toggle"]')!;
  expect(toggle.textContent).toContain("Delivery receipts");
  expect(toggle.textContent).toContain("Show when a Bot has read it");
  const input = toggle.querySelector<HTMLInputElement>("input")!;
  expect(input.dataset.testid).toBe("delivery-receipt-toggle");
  expect(input.checked).toBe(true);
  expect(input.getAttribute("aria-label")).toBe("Delivery receipts");
  await act(async () => input.click());
  expect(change).toHaveBeenCalledExactlyOnceWith(false);
});

it("marks a checked choice with a checkmark and the selected trait", async () => {
  const host = await render(
    <SettingsForm>
      <SettingsSection title="Message display">
        <SettingsRow
          title="Streaming"
          selected
          trailing={<CheckIcon size={20} color="accent" />}
          onPress={() => undefined}
        />
        <SettingsRow
          title="Complete bubbles"
          selected={false}
          onPress={() => undefined}
        />
      </SettingsSection>
    </SettingsForm>,
  );
  const [streaming, complete] = host.querySelectorAll("button");
  expect(streaming!.querySelector('[data-symbol="checkmark"]')).not.toBeNull();
  expect(JSON.parse(streaming!.getAttribute("data-traits")!)).toEqual([
    "isSelected",
  ]);
  expect(complete!.querySelector('[data-symbol="checkmark"]')).toBeNull();
  expect(JSON.parse(complete!.getAttribute("data-traits")!)).toEqual([]);
});

it("shows a trailing value as labeled content, read as the row value", async () => {
  const host = await render(
    <SettingsForm>
      <SettingsSection>
        <SettingsRow
          title="Images"
          trailing={
            <Text style={{ fontVariant: ["tabular-nums"] }}>12 MB</Text>
          }
        />
        <SettingsRow
          title="Pairing"
          trailing={<LoadingIndicator size="control" />}
        />
      </SettingsSection>
    </SettingsForm>,
  );
  expect(host.querySelector('[data-native="value"]')!.textContent).toBe(
    "12 MB",
  );
  const rows = host.querySelectorAll('[data-combine="true"]');
  expect(rows[0]!.getAttribute("data-value")).toBe("12 MB");
  expect(rows[1]!.querySelector("progress")).not.toBeNull();
});

it("marks a destructive row with the destructive role", async () => {
  const host = await render(
    <SettingsForm>
      <SettingsSection>
        <SettingsRow title="Unpair" tone="danger" onPress={() => undefined} />
      </SettingsSection>
    </SettingsForm>,
  );
  expect(host.querySelector("button")!.dataset.role).toBe("destructive");
  expect(host.querySelector("button")!.dataset.tint).toBe("null");
});

it("hosts React Native items and images without nesting native rows inside them", async () => {
  const host = await render(
    <SettingsForm>
      <SettingsFormItem>
        <SettingsRow title="Hosted" />
      </SettingsFormItem>
      <SettingsSection>
        <SettingsRow
          title="Default icon"
          leading={<img alt="" />}
          onPress={() => undefined}
        />
      </SettingsSection>
    </SettingsForm>,
  );
  const item = host.querySelector(
    '[data-native="form"] > [data-native="section"]',
  )!;
  const insets = item
    .querySelector("[data-insets]")!
    .getAttribute("data-insets");
  expect(JSON.parse(insets!)).toEqual({
    top: 0,
    leading: 0,
    bottom: 0,
    trailing: 0,
  });
  const hosted = item.querySelector('[data-native="rn-host"]')!;
  expect(hosted.textContent).toBe("Hosted");
  expect(hosted.querySelector("[data-native]")).toBeNull();
  const button = [...host.querySelectorAll("button")].at(-1)!;
  expect(button.querySelector('[data-native="rn-host"] img')).not.toBeNull();
});

it("renders a preference as a native menu picker inside a form", async () => {
  const change = vi.fn();
  const host = await render(
    <SettingsForm>
      <SettingsSection>
        <PreferenceRow
          title="Appearance"
          icon="appearance"
          testID="settings-appearance"
          value="system"
          options={[
            { value: "system", label: "Follow system", icon: "system" },
            { value: "dark", label: "Dark", icon: "dark" },
          ]}
          onChange={change}
        />
      </SettingsSection>
    </SettingsForm>,
  );
  const picker = host.querySelector('[data-testid="settings-appearance"]')!;
  expect(JSON.parse(picker.getAttribute("data-style")!)).toBe("menu");
  expect(
    picker.querySelector('[data-system-image="circle.lefthalf.filled"]'),
  ).not.toBeNull();
  const select = picker.querySelector("select")!;
  await act(async () => {
    select.value = "dark";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(change).toHaveBeenCalledExactlyOnceWith("dark");
});

it("keeps the React Native rows outside a settings form", async () => {
  const host = await render(
    <SettingsSection title="Bot">
      <SettingsRow title="Model" onPress={() => undefined} />
    </SettingsSection>,
  );
  expect(host.querySelector("[data-native]")).toBeNull();
  expect(host.textContent).toContain("Model");
});
