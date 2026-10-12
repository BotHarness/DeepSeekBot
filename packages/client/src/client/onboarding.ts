import type { OnboardingSnapshot, TutorialAction } from '../../../core/src/onboarding/types.js';
import type { BridgeActions } from './actions.js';
import { errorMessage, type ModelRouteView } from './bridge.js';
import { store } from './store.js';
import { invalidateModelPlan } from './model-plan-store.js';
import type { WindowCompanions } from './window-companions.js';
import {
  loadChecklistEvidence,
  type ChecklistEvidence,
  type ChecklistTarget,
} from './onboarding-checklist.js';

export interface PendingWelcomeRequest {
  channelId: string;
  slug: string;
  body: string;
}
export interface OnboardingViewState {
  receipt?: OnboardingSnapshot | undefined;
  pending?: PendingWelcomeRequest | undefined;
  modelOpen: boolean;
  modelTarget?: { channelId: string; slug: string } | undefined;
  sendOpen: boolean;
  guideOpen: boolean;
  checklistOpen: boolean;
  evidence?: ChecklistEvidence | undefined;
  experience?: 'memory' | 'im' | undefined;
  busy: boolean;
  error?: string | undefined;
}
export class OnboardingController {
  private state: OnboardingViewState = {
    modelOpen: false,
    sendOpen: false,
    guideOpen: false,
    checklistOpen: false,
    busy: false,
  };
  private listeners = new Set<() => void>();
  private entering: Promise<void> | undefined;
  constructor(readonly actions: BridgeActions) {}
  getSnapshot = (): OnboardingViewState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private update(change: Partial<OnboardingViewState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }
  async enter(companion?: WindowCompanions): Promise<void> {
    if (this.entering) return this.entering;
    this.entering = this.refresh(undefined, undefined, companion).finally(() => {
      this.entering = undefined;
    });
    return this.entering;
  }
  async refresh(
    slug?: string,
    action?: TutorialAction,
    companion?: WindowCompanions,
    select = false,
  ): Promise<void> {
    try {
      const receipt = await this.actions.onboarding(slug, action);
      const first = this.state.receipt === undefined;
      const justCompleted = receipt.completed && !this.state.receipt?.completed;
      const opening = action === 'start' || action === 'continue' || action === 'restart';
      this.update({
        receipt,
        error: undefined,
        guideOpen: justCompleted || receipt.tutorial !== 'active' ? false : this.state.guideOpen,
        checklistOpen: receipt.tutorial !== 'active' ? false : opening || this.state.checklistOpen,
      });
      if (opening || (justCompleted && !first)) void this.refreshEvidence();
      if (first) {
        try {
          const saved = sessionStorage.getItem(`botharness/onboarding-draft/${receipt.profileId}`);
          if (saved) {
            const draft = JSON.parse(saved) as PendingWelcomeRequest;
            if (
              typeof draft.channelId === 'string' &&
              typeof draft.slug === 'string' &&
              typeof draft.body === 'string'
            )
              this.update({ pending: draft });
          }
        } catch {}
      }
      if (first || select) {
        await this.actions.load();
        if (receipt.defaultBotSlug) {
          await companion?.start();
          companion?.initializeDefault(receipt.defaultBotSlug);
        }
        if (receipt.channelId && (select || store.getSnapshot().selection === undefined))
          await this.actions.openChannel(receipt.channelId);
      }
    } catch (error) {
      this.update({ error: errorMessage(error) });
    }
  }
  private companion: WindowCompanions | undefined;
  attachCompanion(companion: WindowCompanions | undefined): void {
    this.companion = companion;
  }
  target(): ChecklistTarget | undefined {
    const receipt = this.state.receipt;
    if (!receipt?.channelId) return undefined;
    const slug =
      receipt.defaultBotSlug ??
      store.getSnapshot().channels.find((channel) => channel.id === receipt.channelId)?.botSlug;
    return slug ? { slug, channelId: receipt.channelId } : undefined;
  }
  async refreshEvidence(): Promise<void> {
    const receipt = this.state.receipt;
    if (!receipt) return;
    const target = this.target();
    const present = target !== undefined && this.companion?.get(target.slug) !== undefined;
    const evidence = await loadChecklistEvidence(this.actions, receipt, target, present);
    this.update({ evidence });
  }
  openChecklist(): void {
    const receipt = this.state.receipt;
    if (receipt === undefined || receipt.tutorial === 'not-started') {
      void this.refresh(undefined, 'start');
      return;
    }
    if (receipt.tutorial === 'paused') {
      void this.refresh(undefined, 'continue');
      return;
    }
    if (receipt.tutorial === 'skipped') {
      void this.refresh(undefined, 'restart');
      return;
    }
    this.update({ checklistOpen: true });
    void this.refreshEvidence();
  }
  closeChecklist(): void {
    if (!this.state.checklistOpen) return;
    this.update({ checklistOpen: false });
    if (this.state.receipt?.tutorial === 'active' && !this.state.guideOpen)
      void this.refresh(undefined, 'pause');
  }
  closeChecklistForAction(): void {
    this.update({ checklistOpen: false });
  }
  skipTutorial(): void {
    this.update({ checklistOpen: false, guideOpen: false });
    void this.refresh(undefined, 'skip');
  }
  async startTour(): Promise<void> {
    const target = this.target();
    this.closeChecklistForAction();
    if (target && store.getSnapshot().conversation.channel?.id !== target.channelId)
      await this.actions.openChannel(target.channelId);
    if (this.state.receipt?.tutorial !== 'active') await this.refresh(undefined, 'continue');
    this.update({ guideOpen: true, checklistOpen: false });
  }
  async openExperience(kind: 'memory' | 'im'): Promise<void> {
    const target = this.target();
    if (!target) return;
    this.update({ checklistOpen: false });
    if (store.getSnapshot().conversation.channel?.id !== target.channelId)
      await this.actions.openChannel(target.channelId);
    this.update({ experience: kind });
  }
  consumeExperience(kind: 'memory' | 'im'): boolean {
    if (this.state.experience !== kind) return false;
    this.update({ experience: undefined });
    return true;
  }
  syncCompanionEvidence(): void {
    const target = this.target();
    const evidence = this.state.evidence;
    if (!target || !evidence) return;
    const present = this.companion?.get(target.slug) !== undefined;
    if (present !== evidence.companion)
      this.update({ evidence: { ...evidence, companion: present } });
  }
  summonCompanion(): void {
    const target = this.target();
    if (!target || !this.companion) return;
    this.closeChecklistForAction();
    void this.companion.start().then(() => {
      this.companion?.select(target.slug);
      this.syncCompanionEvidence();
    });
  }
  async focusConversation(): Promise<void> {
    const target = this.target();
    this.closeChecklistForAction();
    if (target && store.getSnapshot().conversation.channel?.id !== target.channelId)
      await this.actions.openChannel(target.channelId);
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLElement>(
        '[data-bh-tour="composer"] textarea, [data-bh-tour="composer"] [contenteditable="true"]',
      );
      input?.focus();
    });
  }
  private savePending(pending: PendingWelcomeRequest | undefined): void {
    this.update({ pending });
    try {
      const profileId = this.state.receipt?.profileId;
      if (!profileId) return;
      const key = `botharness/onboarding-draft/${profileId}`;
      if (pending) sessionStorage.setItem(key, JSON.stringify(pending));
      else sessionStorage.removeItem(key);
    } catch {}
  }
  markSubmitted(channelId: string, body: string): void {
    if (this.state.pending?.channelId === channelId && this.state.pending.body === body)
      this.savePending(undefined);
  }
  finishTour(): void {
    this.update({ guideOpen: false, checklistOpen: this.state.receipt?.tutorial === 'active' });
  }
  pauseGuide(): void {
    const wasOpen = this.state.guideOpen;
    this.update({ guideOpen: false });
    if (wasOpen && this.state.receipt?.tutorial === 'active') void this.refresh(undefined, 'pause');
  }
  prepareSend(channelId: string, slug: string, body: string): boolean | Promise<boolean> {
    this.pauseGuide();
    if (!this.state.receipt || this.state.receipt.completed) return true;
    return this.inspectSend(channelId, slug, body).catch((error: unknown) => {
      this.savePending({ channelId, slug, body });
      this.update({ error: errorMessage(error) });
      return false;
    });
  }
  private async inspectSend(channelId: string, slug: string, body: string): Promise<boolean> {
    const [{ models, default: fallback }, state] = await Promise.all([
      this.actions.modelCatalog(),
      this.actions.modelPlanState(slug),
    ]);
    const route = state.plan?.orchestrator ?? fallback;
    if (
      !state.repair &&
      route &&
      models.some(
        (model) =>
          model.provider === route.provider &&
          model.model === route.model &&
          model.credential === undefined,
      )
    )
      return true;
    this.savePending({ channelId, slug, body });
    this.update({
      modelOpen: true,
      modelTarget: { channelId, slug },
      sendOpen: false,
      error: undefined,
    });
    return false;
  }
  async request(channelId: string, body: string): Promise<void> {
    if (this.state.busy || store.getSnapshot().conversation.sending) return;
    this.update({ busy: true, error: undefined });
    try {
      if (store.getSnapshot().conversation.channel?.id !== channelId)
        await this.actions.openChannel(channelId);
      await this.actions.send(body);
    } catch (error) {
      this.update({ error: errorMessage(error) });
    } finally {
      this.update({ busy: false });
    }
  }
  chooseModel(channelId: string, slug: string, body?: string): void {
    if (this.state.busy || store.getSnapshot().conversation.sending) return;
    this.pauseGuide();
    if (body !== undefined) this.savePending({ channelId, slug, body });
    this.update({
      modelOpen: true,
      modelTarget: { channelId, slug },
      sendOpen: false,
      error: undefined,
    });
  }
  reviewPending(): void {
    if (this.state.pending) {
      this.pauseGuide();
      this.update({ sendOpen: true, modelOpen: false, error: undefined });
    }
  }
  closeModel(): void {
    this.update({ modelOpen: false, modelTarget: undefined });
  }
  closeSend(): void {
    this.update({ sendOpen: false });
  }
  async saveModel(
    route: ModelRouteView,
    globalDefault: boolean,
    expectedRevision: number,
  ): Promise<void> {
    const target = this.state.modelTarget;
    if (!target || this.state.busy) return;
    this.update({ busy: true, error: undefined });
    try {
      await this.actions.onboardingModel(target.slug, expectedRevision, route, globalDefault);
      invalidateModelPlan(target.slug);
      this.update({
        modelOpen: false,
        modelTarget: undefined,
        sendOpen: this.state.pending?.channelId === target.channelId,
      });
    } catch (error) {
      this.update({ error: errorMessage(error) });
      throw error;
    } finally {
      this.update({ busy: false });
    }
  }
  async sendPending(): Promise<void> {
    const pending = this.state.pending;
    if (!pending || this.state.busy) return;
    this.update({ busy: true, error: undefined, sendOpen: false });
    try {
      if (store.getSnapshot().conversation.channel?.id !== pending.channelId)
        await this.actions.openChannel(pending.channelId);
      if (await this.actions.send(pending.body)) this.savePending(undefined);
    } catch (error) {
      this.update({ error: errorMessage(error) });
    } finally {
      this.update({ busy: false, sendOpen: Boolean(this.state.pending) && !this.state.modelOpen });
    }
  }
}
const controllers = new WeakMap<BridgeActions, OnboardingController>();
export function onboardingFor(actions: BridgeActions): OnboardingController {
  let controller = controllers.get(actions);
  if (!controller) {
    controller = new OnboardingController(actions);
    controllers.set(actions, controller);
  }
  return controller;
}
export function requestBotCreation(): void {
  document.dispatchEvent(new Event('botharness/create-bot'));
}
