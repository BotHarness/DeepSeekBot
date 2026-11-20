import * as stylex from '@stylexjs/stylex';
import {
  DEFAULT_TILTIES_COLLECTION,
  TILTIES_COLLECTIONS,
  type TiltiesCollectionId,
} from '@botharness/host-client/tilties-avatars';
import { useId, useState, type ReactElement } from 'react';

import { Button } from './ds/button.js';
import { Icon } from './ds/icon.js';
import { SegmentedControl } from './ds/segmented.js';
import { accent, edge, size, space } from './ds/tobs.stylex.js';
import type { BotHarnessTranslate } from './locale.js';

const styles = stylex.create({
  picker: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: space.x3,
    width: '100%',
  },
  gallery: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.x2,
    width: '100%',
  },
  tile: {
    width: `calc(${size.rowLarge} + ${size.control})`,
    aspectRatio: '1',
  },
  selected: {
    content: { default: null, '::after': '""' },
    position: { default: null, '::after': 'absolute' },
    inset: { default: null, '::after': 0 },
    borderRadius: { default: null, '::after': 'inherit' },
    boxShadow: { default: null, '::after': `inset 0 0 0 ${edge.focus} ${accent.focus}` },
    pointerEvents: { default: null, '::after': 'none' },
  },
  image: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
});

export type AvatarPresetChoice<Recipe> =
  | { kind: 'pixel'; recipe: Recipe }
  | { kind: 'tilties'; image: string };

type AvatarStyle = AvatarPresetChoice<unknown>['kind'];

export function AvatarPresetPicker<Recipe>({
  selected,
  pixelPresets,
  onChoose,
  onCustomize,
  disabled,
  pixelDisabled,
  hasTilties,
  t,
}: {
  selected: AvatarPresetChoice<Recipe> | undefined;
  pixelPresets: readonly { recipe: Recipe; image: string }[];
  onChoose(choice: AvatarPresetChoice<Recipe>): void;
  onCustomize(): void;
  disabled: boolean;
  pixelDisabled: boolean;
  hasTilties: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  const id = useId();
  const [style, switchStyle] = useState<AvatarStyle>(
    pixelDisabled && hasTilties ? 'tilties' : 'pixel',
  );
  const [collection, selectCollection] = useState<TiltiesCollectionId>(DEFAULT_TILTIES_COLLECTION);
  const portraits = TILTIES_COLLECTIONS.find(({ id }) => id === collection)?.portraits ?? [];
  return (
    <div {...stylex.props(styles.picker)}>
      {hasTilties ? (
        <SegmentedControl<AvatarStyle>
          id={id}
          controlsPanel
          label={t('profile.avatar.style')}
          options={[
            { value: 'pixel', label: t('profile.avatar.pixel') },
            { value: 'tilties', label: t('profile.avatar.tilties') },
          ]}
          value={style}
          onChange={switchStyle}
          disabled={disabled}
        />
      ) : null}
      <div
        {...stylex.props(styles.picker)}
        id={`${id}-${style}-panel`}
        role={hasTilties ? 'tabpanel' : undefined}
        aria-labelledby={hasTilties ? `${id}-${style}` : undefined}
      >
        {style === 'pixel' ? (
          <>
            {pixelDisabled ? (
              <p className="bh-avatar-unsupported" data-avatar-unsupported role="note">
                {t('profile.avatar.unsupported')}
              </p>
            ) : (
              <div
                {...stylex.props(styles.gallery)}
                role="group"
                aria-label={t('profile.avatar.presets')}
              >
                {pixelPresets.map(({ recipe, image }, index) => {
                  const label = t('profile.avatar.preset', { index: String(index + 1) });
                  const pressed = selected?.kind === 'pixel' && selected.recipe === recipe;
                  return (
                    <Button
                      key={index}
                      variant="preview"
                      type="button"
                      xstyle={[styles.tile, pressed && styles.selected]}
                      aria-label={label}
                      aria-pressed={pressed}
                      data-avatar-preset={index}
                      disabled={disabled}
                      onClick={() => onChoose({ kind: 'pixel', recipe })}
                    >
                      <img src={image} alt="" decoding="async" {...stylex.props(styles.image)} />
                    </Button>
                  );
                })}
              </div>
            )}
            <Button
              data-avatar-edit
              size="sm"
              variant="outline"
              type="button"
              icon={<Icon name="palette" />}
              disabled={disabled || pixelDisabled}
              onClick={onCustomize}
            >
              {t('profile.avatar.designTitle')}
            </Button>
          </>
        ) : (
          <>
            <SegmentedControl<TiltiesCollectionId>
              id={`${id}-collection`}
              label={t('profile.avatar.collections')}
              options={TILTIES_COLLECTIONS.map(({ id, en, zh }) => ({
                value: id,
                label: t('profile.avatar.tiltiesName', { en, zh }),
              }))}
              value={collection}
              onChange={selectCollection}
              disabled={disabled}
            />
            <div
              {...stylex.props(styles.gallery)}
              role="group"
              aria-label={t('profile.avatar.tilties')}
            >
              {portraits.map(({ id, en, zh, image }) => {
                const label = t('profile.avatar.tiltiesName', { en, zh });
                const pressed = selected?.kind === 'tilties' && selected.image === image;
                return (
                  <Button
                    key={id}
                    variant="preview"
                    type="button"
                    xstyle={[styles.tile, pressed && styles.selected]}
                    aria-label={label}
                    aria-pressed={pressed}
                    title={label}
                    data-tilties-avatar={id}
                    disabled={disabled}
                    onClick={() => onChoose({ kind: 'tilties', image })}
                  >
                    <img src={image} alt="" decoding="async" {...stylex.props(styles.image)} />
                  </Button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
