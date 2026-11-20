import type { ComponentProps, ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { BotIcon } from './bot-icon.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { styles as stepStyles } from './bot-intro-step-styles.js';

type DivStyle = Pick<ComponentProps<'div'>, 'className' | 'style'>;

const REVIEWS: readonly BotHarnessKey[] = [
  'intro.reviews.clean',
  'intro.reviews.era',
  'intro.reviews.details',
];

const styles = stylex.create({
  letter: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    padding: space.x5,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  review: {
    margin: 0,
    padding: space.x4,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  note: { display: 'flex', flexDirection: 'column', gap: space.x2 },
  signature: {
    margin: 0,
    alignSelf: 'flex-end',
    color: color.muted,
    fontSize: text.bodySize,
  },
});

export function WelcomeStep({
  t,
  heroCopyProps,
}: {
  t: BotHarnessTranslate;
  heroCopyProps: DivStyle;
}): ReactElement {
  return (
    <>
      <div {...stylex.props(stepStyles.hero)}>
        <BotIcon icon="mascot" size={96} />
        <div {...heroCopyProps}>
          <h2 {...stylex.props(stepStyles.title)}>{t('intro.welcome.greeting')}</h2>
          <p {...stylex.props(stepStyles.copy)}>{t('intro.welcome.body')}</p>
          <p {...stylex.props(stepStyles.copy)}>{t('intro.welcome.next')}</p>
        </div>
      </div>
    </>
  );
}

export function Voices({
  t,
  reviewsProps,
}: {
  t: BotHarnessTranslate;
  reviewsProps: DivStyle;
}): ReactElement {
  return (
    <>
      <section {...stylex.props(stepStyles.section)} aria-label={t('intro.reviews.title')}>
        <h3 {...stylex.props(stepStyles.sectionTitle)}>{t('intro.reviews.title')}</h3>
        <div {...reviewsProps} data-user-reviews>
          {REVIEWS.map((key) => (
            <blockquote key={key} {...stylex.props(styles.review)}>
              {t(key)}
            </blockquote>
          ))}
        </div>
      </section>
      <section {...stylex.props(styles.letter)} aria-label={t('intro.founder.title')}>
        <h3 {...stylex.props(stepStyles.sectionTitle)}>{t('intro.founder.title')}</h3>
        <div {...stylex.props(styles.note)} data-founder-note>
          {t('intro.founder.body')
            .split('\n')
            .map((line) => (
              <p key={line} {...stylex.props(stepStyles.copy)}>
                {line}
              </p>
            ))}
        </div>
        <p {...stylex.props(styles.signature)}>{t('intro.founder.signature')}</p>
      </section>
    </>
  );
}
