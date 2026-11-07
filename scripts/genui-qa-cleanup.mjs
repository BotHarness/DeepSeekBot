export async function stopGenuiQaBot(call, bot) {
  await call('pause', { slug: bot.slug });
  const stop = await call('botStop', { botSlug: bot.slug, channelId: bot.channelId });
  return { paused: true, stop };
}
