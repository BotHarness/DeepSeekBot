import {
  Button,
  HStack,
  Image,
  Label,
  LabeledContent,
  ProgressView,
  RNHostView,
  Section,
  Spacer,
  Text,
  Toggle as NativeToggle,
  VStack,
} from "@expo/ui/swift-ui";
import {
  accessibilityAddTraits,
  accessibilityElement,
  accessibilityLabel as labelModifier,
  accessibilityValue,
  bold,
  disabled as disabledModifier,
  font,
  listRowBackground,
  foregroundStyle,
  monospacedDigit,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import type { ColorValue, StyleProp, TextStyle } from "react-native";
import { View, StyleSheet } from "react-native";

import { useDesignTheme } from "../design/theme";
import { space } from "../design/tokens";
import { CheckIcon } from "../shell/icons";
import { LoadingIndicator } from "./loading-indicator";
import { RowIcon, rowSymbol, type RowIconName } from "./row-icon";
import { SettingsFormContext } from "./settings-form-context";
import type {
  SettingsRowProps,
  SettingsSectionProps,
} from "./settings-form-row";
import type { SettingsRowControl } from "./settings-row-model";
import { Text as RowText } from "./text";
import { Toggle, type ToggleProps } from "./toggle";

type Trailing =
  | { kind: "none" }
  | { kind: "toggle"; props: ToggleProps }
  | { kind: "check" }
  | { kind: "progress" }
  | { kind: "value"; text: string; digits: boolean }
  | { kind: "add" }
  | { kind: "hosted"; node: ReactElement };

const PRIMARY = { type: "hierarchical", style: "primary" } as const;
const SECONDARY = { type: "hierarchical", style: "secondary" } as const;
const TERTIARY = { type: "hierarchical", style: "tertiary" } as const;

function nativeTrailing(trailing: ReactNode): Trailing {
  if (trailing === undefined || trailing === null || trailing === false)
    return { kind: "none" };
  if (!isValidElement(trailing)) return { kind: "none" };
  const element = trailing as ReactElement<Record<string, unknown>>;
  if (element.type === Toggle)
    return { kind: "toggle", props: element.props as ToggleProps };
  if (element.type === CheckIcon) return { kind: "check" };
  if (element.type === LoadingIndicator) return { kind: "progress" };
  if (element.type === RowText) {
    const children = element.props.children;
    if (typeof children === "string" || typeof children === "number") {
      const style = StyleSheet.flatten(
        element.props.style as StyleProp<TextStyle>,
      );
      return {
        kind: "value",
        text: String(children),
        digits: style?.fontVariant?.includes("tabular-nums") === true,
      };
    }
  }
  return { kind: "hosted", node: element };
}

function controlTrailing(
  control: SettingsRowControl,
  label: string,
): { end: Trailing; chevron: boolean } {
  switch (control.kind) {
    case "switch":
      return {
        end: {
          kind: "toggle",
          props: {
            label,
            value: control.value,
            onChange: control.onChange,
            ...(control.disabled === undefined
              ? {}
              : { disabled: control.disabled }),
            ...(control.testID === undefined ? {} : { testID: control.testID }),
          },
        },
        chevron: false,
      };
    case "check":
      return { end: { kind: "check" }, chevron: false };
    case "busy":
      return { end: { kind: "progress" }, chevron: false };
    case "value":
      return {
        end: { kind: "value", text: control.text, digits: true },
        chevron: control.chevron === true,
      };
    case "chevron":
      return { end: { kind: "none" }, chevron: true };
    case "add":
      return { end: { kind: "add" }, chevron: false };
  }
}

function nativeLeading(
  leading: ReactNode,
): { name: RowIconName; color?: ColorValue } | undefined {
  if (!isValidElement(leading) || leading.type !== RowIcon) return undefined;
  return leading.props as { name: RowIconName; color?: ColorValue };
}

function Hosted({ children }: { children: ReactElement }) {
  return (
    <RNHostView matchContents>
      <SettingsFormContext.Provider value={false}>
        <View>{children}</View>
      </SettingsFormContext.Provider>
    </RNHostView>
  );
}

export function FormSection({ title, footer, children }: SettingsSectionProps) {
  const theme = useDesignTheme();
  return (
    <Section
      modifiers={[listRowBackground(theme.layer.raised.fill)]}
      {...(title === undefined ? {} : { title })}
      {...(footer === undefined ? {} : { footer: <Text>{footer}</Text> })}
    >
      <SettingsFormContext.Provider value="section">
        {children}
      </SettingsFormContext.Provider>
    </Section>
  );
}

export function FormRow({
  title,
  detail,
  tone = "fg",
  strong = false,
  icon,
  iconTone,
  leading,
  control,
  trailing,
  accessory,
  selected,
  disclosure = false,
  accessibilityLabel,
  testID,
  onPress,
}: SettingsRowProps) {
  const theme = useDesignTheme();
  const symbol =
    icon === undefined
      ? nativeLeading(leading)
      : {
          name: icon,
          ...(iconTone === undefined ? {} : { color: theme.color[iconTone] }),
        };
  const fromControl =
    control === undefined
      ? undefined
      : controlTrailing(control, accessibilityLabel ?? title);
  const end = fromControl?.end ?? nativeTrailing(trailing);
  const showChevron = fromControl?.chevron === true || disclosure;
  const titleStyle =
    tone === "fg"
      ? foregroundStyle(PRIMARY)
      : tone === "muted" || tone === "subtle"
        ? foregroundStyle(SECONDARY)
        : onPress !== undefined && (tone === "danger" || tone === "accent")
          ? undefined
          : foregroundStyle({ type: "color", color: theme.color[tone] });
  const text = (
    <VStack alignment="leading" spacing={space.x1}>
      <Text
        modifiers={[
          font({ textStyle: "body" }),
          ...(titleStyle === undefined ? [] : [titleStyle]),
          ...(strong ? [bold()] : []),
        ]}
      >
        {title}
      </Text>
      {detail === undefined ? null : (
        <Text
          modifiers={[
            font({ textStyle: "footnote" }),
            foregroundStyle(SECONDARY),
          ]}
        >
          {detail}
        </Text>
      )}
    </VStack>
  );
  const label =
    symbol !== undefined ? (
      <Label
        icon={
          <Image
            systemName={rowSymbol(symbol.name).ios}
            modifiers={[
              foregroundStyle(
                symbol.color === undefined
                  ? PRIMARY
                  : { type: "color", color: symbol.color },
              ),
            ]}
          />
        }
      >
        {text}
      </Label>
    ) : leading !== undefined && isValidElement(leading) ? (
      <HStack spacing={space.x4}>
        <Hosted>{leading}</Hosted>
        {text}
      </HStack>
    ) : (
      text
    );
  const spoken = accessibilityLabel ?? title;
  const value = [
    accessibilityLabel === undefined ? detail : undefined,
    end.kind === "value" ? end.text : undefined,
  ]
    .filter((part): part is string => part !== undefined)
    .join(", ");

  if (end.kind === "toggle")
    return (
      <NativeToggle
        {...(end.props.testID === undefined
          ? {}
          : { testID: end.props.testID })}
        isOn={end.props.value}
        onIsOnChange={end.props.onChange}
        modifiers={[
          disabledModifier(end.props.disabled === true),
          labelModifier(end.props.label),
          ...(detail === undefined ? [] : [accessibilityValue(detail)]),
        ]}
      >
        {label}
      </NativeToggle>
    );

  const trailingView =
    end.kind === "check" ? (
      <Image
        systemName="checkmark"
        modifiers={[
          font({ textStyle: "body", weight: "semibold" }),
          foregroundStyle(theme.color.accent),
        ]}
      />
    ) : end.kind === "progress" ? (
      <ProgressView />
    ) : end.kind === "add" ? (
      <Image
        systemName="plus"
        modifiers={[foregroundStyle(theme.color.accent)]}
      />
    ) : end.kind === "hosted" ? (
      <Hosted>{end.node}</Hosted>
    ) : null;
  const chevron = showChevron ? (
    <Image
      systemName="chevron.right"
      modifiers={[
        font({ textStyle: "footnote", weight: "semibold" }),
        foregroundStyle(TERTIARY),
      ]}
    />
  ) : null;
  const content =
    end.kind === "value" ? (
      <LabeledContent label={label}>
        <HStack spacing={space.x2}>
          <Text modifiers={end.digits ? [monospacedDigit()] : []}>
            {end.text}
          </Text>
          {chevron}
        </HStack>
      </LabeledContent>
    ) : (
      <HStack spacing={space.x2}>
        {label}
        <Spacer />
        {trailingView}
        {chevron}
      </HStack>
    );
  const a11y = [
    labelModifier(spoken),
    ...(value === "" ? [] : [accessibilityValue(value)]),
    ...(selected === true ? [accessibilityAddTraits(["isSelected"])] : []),
  ];
  const row =
    onPress === undefined ? (
      <VStack
        alignment="leading"
        modifiers={[accessibilityElement("combine"), ...a11y]}
      >
        {content}
      </VStack>
    ) : (
      <Button
        {...(testID === undefined ? {} : { testID })}
        {...(tone === "danger" ? { role: "destructive" as const } : {})}
        onPress={onPress}
        modifiers={
          tone === "danger" || tone === "accent"
            ? a11y
            : [tint(theme.color.fg), ...a11y]
        }
      >
        {content}
      </Button>
    );
  if (accessory === undefined || !isValidElement(accessory)) return row;
  return (
    <HStack spacing={space.x2}>
      {row}
      <Hosted>{accessory}</Hosted>
    </HStack>
  );
}
