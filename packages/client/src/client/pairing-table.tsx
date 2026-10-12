import { useState, type ReactElement } from 'react';
import { Button, Checkbox, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import type { BotHarnessTranslate } from './locale.js';

export function PairingTable<Row extends { id: string }>({
  data,
  columns,
  selectedId,
  selectedIds,
  disabled = false,
  select,
  label,
  empty,
  t,
}: {
  data: Row[];
  columns: ColumnDef<Row>[];
  selectedId?: string | undefined;
  selectedIds?: string[] | undefined;
  disabled?: boolean | undefined;
  select?: ((row: Row) => void) | undefined;
  label: string;
  empty: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const [filter, setFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => row.id,
    state: {
      globalFilter: filter,
      sorting,
      rowSelection: Object.fromEntries(
        (selectedIds ?? (selectedId ? [selectedId] : [])).map((id) => [id, true]),
      ),
    },
    onGlobalFilterChange: setFilter,
    onSortingChange: setSorting,
    enableMultiRowSelection: !!selectedIds,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 8 } },
  });
  const visible = table.getRowModel().rows;
  return (
    <div className="bh-pairing-table-panel">
      <Input
        aria-label={t('pairing.search', { title: label })}
        placeholder={t('pairing.search', { title: label })}
        value={filter}
        onChange={(event) => table.setGlobalFilter(event.target.value)}
      />
      <div className="bh-pairing-table-scroll">
        <table className="bh-pairing-table" aria-label={label}>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {select ? (
                  <th scope="col">
                    <span className="bh-sr-only">{t('pairing.selection')}</span>
                  </th>
                ) : null}
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={
                      header.column.getIsSorted() === 'asc'
                        ? 'ascending'
                        : header.column.getIsSorted() === 'desc'
                          ? 'descending'
                          : 'none'
                    }
                  >
                    <button
                      type="button"
                      className="bh-pairing-sort"
                      disabled={!header.column.getCanSort()}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() ? (
                        <span aria-hidden="true" className="bh-pairing-sort-indicator">
                          {header.column.getIsSorted() === 'asc'
                            ? ' ↑'
                            : header.column.getIsSorted() === 'desc'
                              ? ' ↓'
                              : ' ↕'}
                        </span>
                      ) : null}
                    </button>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} data-selected={row.getIsSelected() || undefined}>
                {select ? (
                  <td>
                    <Checkbox
                      label={t('pairing.selectEntry', {
                        name: String(row.getValue(columns[0]?.id ?? 'name') ?? row.id),
                      })}
                      checked={row.getIsSelected()}
                      disabled={disabled}
                      onChange={() => select(row.original)}
                    />
                  </td>
                ) : null}
                {row.getVisibleCells().map((cell, index) => (
                  <td key={cell.id}>
                    {index === 0 && select ? (
                      <button
                        type="button"
                        className="bh-pairing-name"
                        disabled={disabled}
                        onClick={() => select(row.original)}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </button>
                    ) : (
                      flexRender(cell.column.columnDef.cell, cell.getContext())
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 ? (
          <p className="bh-pairing-empty">{filter ? t('pairing.noMatches') : empty}</p>
        ) : null}
      </div>
      <div className="bh-pairing-pagination">
        <span className="bh-muted">
          {t('pairing.page', {
            page: table.getState().pagination.pageIndex + 1,
            pages: Math.max(1, table.getPageCount()),
            count: table.getFilteredRowModel().rows.length,
          })}
        </span>
        <Button
          size="sm"
          variant="toolbar"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
        >
          {t('pairing.previous')}
        </Button>
        <Button
          size="sm"
          variant="toolbar"
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
        >
          {t('pairing.next')}
        </Button>
      </div>
    </div>
  );
}
