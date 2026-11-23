import { quotePromptBlock } from './quotes.js';
import { type ChannelMessage } from './channel.js';
import type { ChannelStore } from './store.js';

interface RuntimeQuotesPorts {
  channels: ChannelStore;
  quoteBlocks: Map<string, { channelId: string; message: ChannelMessage }>;
}

export function createRuntimeQuotes(ports: RuntimeQuotesPorts) {
  const { channels, quoteBlocks } = ports;

  function rowQuotes(channelId: string, messageId: string): string {
    return quotePrompt(channelId, channels.message(channelId, messageId));
  }

  function quotePrompt(channelId: string, message: ChannelMessage | undefined): string {
    const block = renderQuotePrompt(channelId, message);
    if (block.length > 0 && message !== undefined) {
      quoteBlocks.delete(block);
      quoteBlocks.set(block, { channelId, message });
      if (quoteBlocks.size > 256) quoteBlocks.delete(quoteBlocks.keys().next().value!);
    }
    return block;
  }

  function turnQuoteBlocks(
    body: string,
  ): ReadonlyArray<readonly [string, { channelId: string; message: ChannelMessage }]> {
    return [...quoteBlocks].filter(([block]) => body.includes(block));
  }

  function refreshQuoteBlocks(
    body: string,
    sources: ReadonlyArray<readonly [string, { channelId: string; message: ChannelMessage }]>,
  ): string {
    let refreshed = body;
    for (const [block, source] of sources) {
      if (!refreshed.includes(block)) continue;
      const current = renderQuotePrompt(source.channelId, source.message);
      if (current !== block) refreshed = refreshed.split(block).join(current);
    }
    return refreshed;
  }

  function renderQuotePrompt(channelId: string, message: ChannelMessage | undefined): string {
    return quotePromptBlock(message?.quotes, (messageId) => {
      const target = channels.message(channelId, messageId);
      if (target === undefined || Reflect.get(target, 'contentPurge') !== undefined)
        return undefined;
      const author =
        target.author.kind === 'bot' || target.author.kind === 'remote-bot'
          ? `PersonaBot ${target.author.slug}`
          : target.author.kind === 'human'
            ? `Human${target.author.displayName === undefined ? '' : ` ${JSON.stringify(target.author.displayName)}`}`
            : target.author.kind === 'bridged'
              ? `${JSON.stringify(target.bridgeOrigin?.senderName ?? target.bridgeOrigin?.senderId ?? 'unknown')} (${target.bridgeOrigin?.platform ?? target.author.source}, external)`
              : 'Channel system';
      return { author, body: target.body };
    });
  }

  return { rowQuotes, quotePrompt, turnQuoteBlocks, refreshQuoteBlocks };
}
