import type { Tokens } from 'marked';
import { memo, useMemo } from 'react';
import { ScrollView, View } from 'react-native';

import { edge, markdownTable, radius, space } from './design/tokens';
import { useDesignTheme } from './design/theme';
import { renderMarkdownInline } from './markdown-inline';
import { Text } from './primitives/text';

const TableRow = memo(function TableRow({
  cells,
  widths,
  align,
  color,
  header,
  last,
}: {
  cells: string;
  widths: string;
  align: string;
  color: string;
  header: boolean;
  last: boolean;
}) {
  const theme = useDesignTheme();
  const values: Tokens.TableCell[] = useMemo(() => JSON.parse(cells), [cells]);
  const columns: number[] = useMemo(() => JSON.parse(widths), [widths]);
  const alignment: Array<'left' | 'center' | 'right' | null> = useMemo(
    () => JSON.parse(align),
    [align],
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: header ? theme.layer.raised.inset : 'transparent',
        borderBottomWidth: last ? 0 : edge.hairline,
        borderBottomColor: theme.layer.raised.divider,
      }}
    >
      {columns.map((width, index) => (
        <View
          key={index}
          style={{
            width,
            padding: space.x3,
            borderRightWidth: index === columns.length - 1 ? 0 : edge.hairline,
            borderRightColor: theme.layer.raised.divider,
          }}
        >
          <Text
            variant="meta"
            strong={header}
            style={{ color, textAlign: alignment[index] ?? 'left' }}
            {...(header ? { accessibilityRole: 'header' as const } : {})}
          >
            {renderMarkdownInline(values[index]?.tokens ?? [], theme)}
          </Text>
        </View>
      ))}
    </View>
  );
});

export function MarkdownTable({ table, color }: { table: Tokens.Table; color: string }) {
  const theme = useDesignTheme();
  const widths = JSON.stringify(
    table.header.map((_, index) => {
      const widest = Math.max(
        ...[table.header, ...table.rows].map((row) =>
          Array.from(row[index]?.text ?? '').reduce(
            (size, char) => size + ((char.codePointAt(0) ?? 0) > 255 ? 1 : 0.6),
            0,
          ),
        ),
      );
      return Math.min(
        markdownTable.maxColumnWidth,
        Math.max(markdownTable.minColumnWidth, widest * theme.type.meta.size + space.x3 * 2),
      );
    }),
  );
  const align = JSON.stringify(table.align);
  return (
    <ScrollView horizontal style={{ flexGrow: 0 }}>
      <View
        style={{
          borderWidth: edge.hairline,
          borderColor: theme.layer.raised.divider,
          borderRadius: radius.sm,
          overflow: 'hidden',
        }}
      >
        <TableRow
          cells={JSON.stringify(table.header)}
          widths={widths}
          align={align}
          color={color}
          header
          last={table.rows.length === 0}
        />
        {table.rows.map((row, index) => (
          <TableRow
            key={index}
            cells={JSON.stringify(row)}
            widths={widths}
            align={align}
            color={color}
            header={false}
            last={index === table.rows.length - 1}
          />
        ))}
      </View>
    </ScrollView>
  );
}
