import { RefreshingAuthProvider } from "@twurple/auth";
import { ChatClient } from "@twurple/chat";
import { EventSubWsListener } from "@twurple/eventsub-ws";
import { TwitchApi } from "./api";
import { updateAccountTokens } from "./db";
import type {
  EventHandler,
  ChatMessageEvent,
  ChatActionEvent,
  ChatSubEvent,
  ChatSubGiftEvent,
  ChatCommunitySubEvent,
  ChatSubExtendEvent,
  ChatRaidEvent,
  ChatBanEvent,
  ChatTimeoutEvent,
  ChatMessageRemoveEvent,
  ChatClearEvent,
  ChatWhisperEvent,
  ChatAnnouncementEvent,
  ChatJoinEvent,
  ChatPartEvent,
  ChatBitsBadgeUpgradeEvent,
} from "@module-twitch/shared/types";
import type { Account } from "./db";

export class TwitchClient extends TwitchApi {
  private chat: ChatClient;
  readonly channel: string;
  readonly twitchUserId: string;
  readonly accountId: string;
  private eventHandler: EventHandler | null = null;
  private eventSubListener: EventSubWsListener;
  private eventSubSubs = new Map<string, { stop(): void }>();

  private constructor(
    account: Account,
    authProvider: RefreshingAuthProvider,
  ) {
    super(authProvider);
    this.channel = account.twitchLogin;
    this.twitchUserId = account.twitchUserId;
    this.accountId = account.id;
    this.chat = new ChatClient({ authProvider, channels: [account.twitchLogin], requestMembershipEvents: true });
    this.eventSubListener = new EventSubWsListener({ apiClient: this.api });

    // Twurple creates subscriptions asynchronously, so subscribeEventSub()
    // returns before Twitch has accepted or refused. Without this handler a
    // refusal (a missing scope, most often) is invisible: the trigger shows up
    // in the hub and never fires.
    this.eventSubListener.onSubscriptionCreateFailure((sub, error) => {
      console.error(
        `[twitch] EventSub subscription failed (${sub.id}): ${error.message}`
      );
    });

    this.registerChatEvents();
  }

  static async create(
    account: Account,
    clientId: string,
    clientSecret: string,
  ): Promise<TwitchClient> {
    const authProvider = new RefreshingAuthProvider({ clientId, clientSecret });

    authProvider.onRefresh(async (_userId, newToken) => {
      console.log(`[twitch:${account.twitchLogin}] Token refreshed`);
      await updateAccountTokens(
        account.id,
        newToken.accessToken,
        newToken.refreshToken,
        newToken.expiresIn,
        newToken.obtainmentTimestamp,
      );
    });

    await authProvider.addUserForToken({
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      scope: account.scopes ? account.scopes.split(" ") : [],
      expiresIn: account.expiresIn,
      obtainmentTimestamp: account.obtainmentTimestamp,
    }, ["chat"]);

    return new TwitchClient(account, authProvider);
  }

  private registerChatEvents(): void {
    // ── chat.message ──
    this.chat.onMessage((_chan, _user, _text, msg) => {
      const info = msg.userInfo;
      this.emit("chat.message", {
        id: msg.id,
        channel: _chan.replace(/^#/, ""),
        channel_id: msg.channelId,
        user_id: info.userId,
        username: info.userName,
        display_name: info.displayName,
        message: _text,
        timestamp: msg.date.getTime(),
        color: info.color ?? null,
        is_cheer: msg.isCheer,
        bits: msg.bits,
        is_first: msg.isFirst,
        is_returning_chatter: msg.isReturningChatter,
        is_reply: msg.isReply,
        parent_message_id: msg.parentMessageId ?? null,
        parent_message_text: msg.parentMessageText ?? null,
        is_broadcaster: info.isBroadcaster,
        is_mod: info.isMod,
        is_subscriber: info.isSubscriber,
        is_vip: info.isVip,
      } satisfies ChatMessageEvent);
    });

    // ── chat.action (/me) ──
    this.chat.onAction((_chan, _user, _text, msg) => {
      const info = msg.userInfo;
      this.emit("chat.action", {
        id: msg.id,
        channel: _chan.replace(/^#/, ""),
        channel_id: msg.channelId,
        user_id: info.userId,
        username: info.userName,
        display_name: info.displayName,
        message: _text,
        timestamp: msg.date.getTime(),
        color: info.color ?? null,
        is_broadcaster: info.isBroadcaster,
        is_mod: info.isMod,
        is_subscriber: info.isSubscriber,
        is_vip: info.isVip,
      } satisfies ChatActionEvent);
    });

    // ── chat.sub ──
    this.chat.onSub((_chan, _user, subInfo, _msg) => {
      this.emit("chat.sub", {
        channel: _chan.replace(/^#/, ""),
        user_id: subInfo.userId,
        username: _user,
        display_name: subInfo.displayName,
        plan: subInfo.plan,
        plan_name: subInfo.planName,
        is_prime: subInfo.isPrime,
        months: subInfo.months,
        streak: subInfo.streak ?? null,
        message: subInfo.message ?? null,
      } satisfies ChatSubEvent);
    });

    // ── chat.resub ──
    this.chat.onResub((_chan, _user, subInfo, _msg) => {
      this.emit("chat.resub", {
        channel: _chan.replace(/^#/, ""),
        user_id: subInfo.userId,
        username: _user,
        display_name: subInfo.displayName,
        plan: subInfo.plan,
        plan_name: subInfo.planName,
        is_prime: subInfo.isPrime,
        months: subInfo.months,
        streak: subInfo.streak ?? null,
        message: subInfo.message ?? null,
      } satisfies ChatSubEvent);
    });

    // ── chat.sub_gift ──
    this.chat.onSubGift((_chan, _user, subInfo, _msg) => {
      this.emit("chat.sub_gift", {
        channel: _chan.replace(/^#/, ""),
        user_id: subInfo.userId,
        username: _user,
        display_name: subInfo.displayName,
        plan: subInfo.plan,
        plan_name: subInfo.planName,
        months: subInfo.months,
        gift_duration: subInfo.giftDuration,
        gifter: subInfo.gifter ?? null,
        gifter_user_id: subInfo.gifterUserId ?? null,
        gifter_display_name: subInfo.gifterDisplayName ?? null,
        gifter_gift_count: subInfo.gifterGiftCount ?? null,
      } satisfies ChatSubGiftEvent);
    });

    // ── chat.community_sub ──
    this.chat.onCommunitySub((_chan, _user, subInfo, _msg) => {
      this.emit("chat.community_sub", {
        channel: _chan.replace(/^#/, ""),
        username: _user,
        count: subInfo.count,
        plan: subInfo.plan,
        gifter: subInfo.gifter ?? null,
        gifter_user_id: subInfo.gifterUserId ?? null,
        gifter_display_name: subInfo.gifterDisplayName ?? null,
        gifter_gift_count: subInfo.gifterGiftCount ?? null,
      } satisfies ChatCommunitySubEvent);
    });

    // ── chat.sub_extend ──
    this.chat.onSubExtend((_chan, _user, subInfo, _msg) => {
      this.emit("chat.sub_extend", {
        channel: _chan.replace(/^#/, ""),
        user_id: subInfo.userId,
        username: _user,
        display_name: subInfo.displayName,
        plan: subInfo.plan,
        months: subInfo.months,
        end_month: subInfo.endMonth,
      } satisfies ChatSubExtendEvent);
    });

    // ── chat.raid ──
    this.chat.onRaid((_chan, _user, raidInfo, _msg) => {
      this.emit("chat.raid", {
        channel: _chan.replace(/^#/, ""),
        username: _user,
        display_name: raidInfo.displayName,
        viewer_count: raidInfo.viewerCount,
      } satisfies ChatRaidEvent);
    });

    // ── chat.ban ──
    this.chat.onBan((_chan, _user, _msg) => {
      this.emit("chat.ban", {
        channel: _chan.replace(/^#/, ""),
        username: _user,
      } satisfies ChatBanEvent);
    });

    // ── chat.timeout ──
    this.chat.onTimeout((_chan, _user, duration, _msg) => {
      this.emit("chat.timeout", {
        channel: _chan.replace(/^#/, ""),
        username: _user,
        duration,
      } satisfies ChatTimeoutEvent);
    });

    // ── chat.message_remove ──
    this.chat.onMessageRemove((_chan, messageId, _msg) => {
      this.emit("chat.message_remove", {
        channel: _chan.replace(/^#/, ""),
        message_id: messageId,
      } satisfies ChatMessageRemoveEvent);
    });

    // ── chat.chat_clear ──
    this.chat.onChatClear((_chan, _msg) => {
      this.emit("chat.chat_clear", {
        channel: _chan.replace(/^#/, ""),
      } satisfies ChatClearEvent);
    });

    // ── chat.whisper ──
    this.chat.onWhisper((_user, _text, _msg) => {
      this.emit("chat.whisper", {
        username: _user,
        message: _text,
      } satisfies ChatWhisperEvent);
    });

    // ── chat.announcement ──
    this.chat.onAnnouncement((_chan, _user, announcementInfo, _msg) => {
      this.emit("chat.announcement", {
        channel: _chan.replace(/^#/, ""),
        username: _user,
        message: _msg.text ?? "",
        color: announcementInfo.color,
      } satisfies ChatAnnouncementEvent);
    });

    // ── chat.join ──
    this.chat.onJoin((_chan, _user) => {
      this.emit("chat.join", {
        channel: _chan.replace(/^#/, ""),
        username: _user,
      } satisfies ChatJoinEvent);
    });

    // ── chat.part ──
    this.chat.onPart((_chan, _user) => {
      this.emit("chat.part", {
        channel: _chan.replace(/^#/, ""),
        username: _user,
      } satisfies ChatPartEvent);
    });

    // ── chat.bits_badge_upgrade ──
    this.chat.onBitsBadgeUpgrade((_chan, _user, upgradeInfo, _msg) => {
      this.emit("chat.bits_badge_upgrade", {
        channel: _chan.replace(/^#/, ""),
        username: _user,
        display_name: upgradeInfo.displayName,
        threshold: upgradeInfo.threshold,
      } satisfies ChatBitsBadgeUpgradeEvent);
    });
  }

  private emit(eventName: string, data: unknown): void {
    this.eventHandler?.(eventName, data);
  }

  onEvent(handler: EventHandler): void {
    this.eventHandler = handler;
  }

  async connect(): Promise<void> {
    this.chat.connect();
    await new Promise<void>((resolve, reject) => {
      this.chat.onConnect(() => resolve());
      this.chat.onAuthenticationFailure((text) =>
        reject(new Error(`Authentication failed: ${text}`))
      );
    });
    console.log(`[twitch] Connected to #${this.channel}`);

    // Start EventSub WebSocket listener
    this.eventSubListener.start();
    console.log("[twitch] EventSub WS listener started");
  }

  disconnect(): void {
    this.stopAllEventSub();
    this.eventSubListener.stop();
    this.chat.quit();
  }

  // ── Chat methods ───────────────────────────────────────────────────

  async say(message: string, replyTo?: string): Promise<void> {
    await this.chat.say(this.channel, message, replyTo ? { replyTo } : undefined);
  }

  async action(message: string): Promise<void> {
    await this.chat.action(this.channel, message);
  }

  // ── EventSub dynamic subscription ──────────────────────────────────

  subscribeEventSub(eventName: string): boolean {
    const bid = this.twitchUserId;
    if (this.eventSubSubs.has(eventName)) return true;

    let sub: { stop(): void } | null = null;

    switch (eventName) {
      case "eventsub.stream_online":
        sub = this.eventSubListener.onStreamOnline(bid, (e) => {
          this.emit("eventsub.stream_online", {
            broadcaster_id: e.broadcasterId,
            broadcaster_name: e.broadcasterName,
            broadcaster_display_name: e.broadcasterDisplayName,
            type: e.type,
            started_at: e.startDate?.toISOString() ?? null,
          });
        });
        break;

      case "eventsub.stream_offline":
        sub = this.eventSubListener.onStreamOffline(bid, (e) => {
          this.emit("eventsub.stream_offline", {
            broadcaster_id: e.broadcasterId,
            broadcaster_name: e.broadcasterName,
            broadcaster_display_name: e.broadcasterDisplayName,
          });
        });
        break;

      case "eventsub.channel_update":
        sub = this.eventSubListener.onChannelUpdate(bid, (e) => {
          this.emit("eventsub.channel_update", {
            broadcaster_id: e.broadcasterId,
            broadcaster_name: e.broadcasterName,
            broadcaster_display_name: e.broadcasterDisplayName,
            title: e.streamTitle,
            category_id: e.categoryId,
            category_name: e.categoryName,
            language: e.streamLanguage,
            content_classification_labels: e.contentClassificationLabels,
          });
        });
        break;

      case "eventsub.channel_follow":
        sub = this.eventSubListener.onChannelFollow(bid, bid, (e) => {
          this.emit("eventsub.channel_follow", {
            user_id: e.userId,
            user_name: e.userName,
            user_display_name: e.userDisplayName,
            broadcaster_id: e.broadcasterId,
            followed_at: e.followDate.toISOString(),
          });
        });
        break;

      case "eventsub.channel_subscribe":
        sub = this.eventSubListener.onChannelSubscription(bid, (e) => {
          this.emit("eventsub.channel_subscribe", {
            user_id: e.userId,
            user_name: e.userName,
            user_display_name: e.userDisplayName,
            broadcaster_id: e.broadcasterId,
            tier: e.tier,
            is_gift: e.isGift,
          });
        });
        break;

      case "eventsub.channel_subscription_gift":
        sub = this.eventSubListener.onChannelSubscriptionGift(bid, (e) => {
          this.emit("eventsub.channel_subscription_gift", {
            gifter_id: e.gifterId,
            gifter_name: e.gifterName,
            gifter_display_name: e.gifterDisplayName,
            broadcaster_id: e.broadcasterId,
            tier: e.tier,
            amount: e.amount,
            cumulative_amount: e.cumulativeAmount,
            is_anonymous: e.isAnonymous,
          });
        });
        break;

      case "eventsub.channel_subscription_message":
        sub = this.eventSubListener.onChannelSubscriptionMessage(bid, (e) => {
          this.emit("eventsub.channel_subscription_message", {
            user_id: e.userId,
            user_name: e.userName,
            user_display_name: e.userDisplayName,
            broadcaster_id: e.broadcasterId,
            tier: e.tier,
            message: e.messageText,
            cumulative_months: e.cumulativeMonths,
            streak_months: e.streakMonths,
            duration_months: e.durationMonths,
          });
        });
        break;

      case "eventsub.channel_cheer":
        sub = this.eventSubListener.onChannelCheer(bid, (e) => {
          this.emit("eventsub.channel_cheer", {
            user_id: e.userId,
            user_name: e.userName,
            user_display_name: e.userDisplayName,
            broadcaster_id: e.broadcasterId,
            bits: e.bits,
            message: e.message,
            is_anonymous: e.isAnonymous,
          });
        });
        break;

      case "eventsub.channel_raid":
        sub = this.eventSubListener.onChannelRaidTo(bid, (e) => {
          this.emit("eventsub.channel_raid", {
            raider_id: e.raidingBroadcasterId,
            raider_name: e.raidingBroadcasterName,
            raider_display_name: e.raidingBroadcasterDisplayName,
            broadcaster_id: e.raidedBroadcasterId,
            viewers: e.viewers,
          });
        });
        break;

      case "eventsub.channel_ban":
        sub = this.eventSubListener.onChannelBan(bid, (e) => {
          this.emit("eventsub.channel_ban", {
            user_id: e.userId,
            user_name: e.userName,
            user_display_name: e.userDisplayName,
            broadcaster_id: e.broadcasterId,
            moderator_id: e.moderatorId,
            moderator_name: e.moderatorName,
            moderator_display_name: e.moderatorDisplayName,
            reason: e.reason,
            banned_at: e.startDate.toISOString(),
            ends_at: e.endDate?.toISOString() ?? null,
            is_permanent: e.isPermanent,
          });
        });
        break;

      case "eventsub.channel_unban":
        sub = this.eventSubListener.onChannelUnban(bid, (e) => {
          this.emit("eventsub.channel_unban", {
            user_id: e.userId,
            user_name: e.userName,
            user_display_name: e.userDisplayName,
            broadcaster_id: e.broadcasterId,
            moderator_id: e.moderatorId,
            moderator_name: e.moderatorName,
            moderator_display_name: e.moderatorDisplayName,
          });
        });
        break;

      case "eventsub.channel_moderator_add":
        sub = this.eventSubListener.onChannelModeratorAdd(bid, (e) => {
          this.emit("eventsub.channel_moderator_add", {
            user_id: e.userId,
            user_name: e.userName,
            user_display_name: e.userDisplayName,
            broadcaster_id: e.broadcasterId,
          });
        });
        break;

      case "eventsub.channel_moderator_remove":
        sub = this.eventSubListener.onChannelModeratorRemove(bid, (e) => {
          this.emit("eventsub.channel_moderator_remove", {
            user_id: e.userId,
            user_name: e.userName,
            user_display_name: e.userDisplayName,
            broadcaster_id: e.broadcasterId,
          });
        });
        break;

      case "eventsub.channel_reward_redemption_add":
        sub = this.eventSubListener.onChannelRedemptionAdd(bid, (e) => {
          this.emit("eventsub.channel_reward_redemption_add", {
            id: e.id,
            user_id: e.userId,
            user_name: e.userName,
            user_display_name: e.userDisplayName,
            broadcaster_id: e.broadcasterId,
            input: e.input,
            status: e.status,
            reward_id: e.rewardId,
            reward_title: e.rewardTitle,
            reward_cost: e.rewardCost,
            reward_prompt: e.rewardPrompt,
            redeemed_at: e.redemptionDate.toISOString(),
          });
        });
        break;

      case "eventsub.channel_poll_begin":
        sub = this.eventSubListener.onChannelPollBegin(bid, (e) => {
          this.emit("eventsub.channel_poll_begin", {
            id: e.id,
            broadcaster_id: e.broadcasterId,
            title: e.title,
            choices: e.choices.map((c) => ({ id: c.id, title: c.title })),
            started_at: e.startDate.toISOString(),
            ends_at: e.endDate.toISOString(),
          });
        });
        break;

      case "eventsub.channel_poll_end":
        sub = this.eventSubListener.onChannelPollEnd(bid, (e) => {
          this.emit("eventsub.channel_poll_end", {
            id: e.id,
            broadcaster_id: e.broadcasterId,
            title: e.title,
            choices: e.choices.map((c) => ({ id: c.id, title: c.title, total_votes: c.totalVotes })),
            status: e.status,
            started_at: e.startDate.toISOString(),
            ended_at: e.endDate.toISOString(),
          });
        });
        break;

      case "eventsub.channel_prediction_begin":
        sub = this.eventSubListener.onChannelPredictionBegin(bid, (e) => {
          this.emit("eventsub.channel_prediction_begin", {
            id: e.id,
            broadcaster_id: e.broadcasterId,
            title: e.title,
            outcomes: e.outcomes.map((o) => ({ id: o.id, title: o.title, color: o.color })),
            started_at: e.startDate.toISOString(),
            locks_at: e.lockDate.toISOString(),
          });
        });
        break;

      case "eventsub.channel_prediction_lock":
        sub = this.eventSubListener.onChannelPredictionLock(bid, (e) => {
          this.emit("eventsub.channel_prediction_lock", {
            id: e.id,
            broadcaster_id: e.broadcasterId,
            title: e.title,
            outcomes: e.outcomes.map((o) => ({ id: o.id, title: o.title, color: o.color, users: o.users, channel_points: o.channelPoints })),
            started_at: e.startDate.toISOString(),
            locked_at: e.lockDate.toISOString(),
          });
        });
        break;

      case "eventsub.channel_prediction_end":
        sub = this.eventSubListener.onChannelPredictionEnd(bid, (e) => {
          this.emit("eventsub.channel_prediction_end", {
            id: e.id,
            broadcaster_id: e.broadcasterId,
            title: e.title,
            outcomes: e.outcomes.map((o) => ({ id: o.id, title: o.title, color: o.color, users: o.users, channel_points: o.channelPoints })),
            winning_outcome_id: e.winningOutcomeId,
            status: e.status,
            started_at: e.startDate.toISOString(),
            ended_at: e.endDate.toISOString(),
          });
        });
        break;

      case "eventsub.channel_hype_train_begin":
        sub = this.eventSubListener.onChannelHypeTrainBegin(bid, (e) => {
          this.emit("eventsub.channel_hype_train_begin", {
            id: e.id,
            broadcaster_id: e.broadcasterId,
            level: e.level,
            total: e.total,
            progress: e.progress,
            goal: e.goal,
            started_at: e.startDate.toISOString(),
            expires_at: e.expiryDate.toISOString(),
          });
        });
        break;

      case "eventsub.channel_hype_train_end":
        sub = this.eventSubListener.onChannelHypeTrainEnd(bid, (e) => {
          this.emit("eventsub.channel_hype_train_end", {
            id: e.id,
            broadcaster_id: e.broadcasterId,
            level: e.level,
            total: e.total,
            started_at: e.startDate.toISOString(),
            ended_at: e.endDate.toISOString(),
            cooldown_ends_at: e.cooldownEndDate.toISOString(),
          });
        });
        break;

      case "eventsub.channel_shoutout_create":
        sub = this.eventSubListener.onChannelShoutoutCreate(bid, bid, (e) => {
          this.emit("eventsub.channel_shoutout_create", {
            broadcaster_id: e.broadcasterId,
            moderator_id: e.moderatorId,
            moderator_name: e.moderatorName,
            moderator_display_name: e.moderatorDisplayName,
            target_id: e.shoutedOutBroadcasterId,
            target_name: e.shoutedOutBroadcasterName,
            target_display_name: e.shoutedOutBroadcasterDisplayName,
            viewer_count: e.viewerCount,
            started_at: e.startDate.toISOString(),
          });
        });
        break;

      case "eventsub.channel_shoutout_receive":
        sub = this.eventSubListener.onChannelShoutoutReceive(bid, bid, (e) => {
          this.emit("eventsub.channel_shoutout_receive", {
            broadcaster_id: e.broadcasterId,
            from_broadcaster_id: e.shoutingOutBroadcasterId,
            from_broadcaster_name: e.shoutingOutBroadcasterName,
            from_broadcaster_display_name: e.shoutingOutBroadcasterDisplayName,
            viewer_count: e.viewerCount,
            started_at: e.startDate.toISOString(),
          });
        });
        break;

      case "eventsub.channel_ad_break_begin":
        sub = this.eventSubListener.onChannelAdBreakBegin(bid, (e) => {
          this.emit("eventsub.channel_ad_break_begin", {
            broadcaster_id: e.broadcasterId,
            broadcaster_name: e.broadcasterName,
            broadcaster_display_name: e.broadcasterDisplayName,
            duration_seconds: e.durationSeconds,
            started_at: e.startDate.toISOString(),
            is_automatic: e.isAutomatic,
            requester_id: e.requesterId,
            requester_name: e.requesterName,
            requester_display_name: e.requesterDisplayName,
          });
        });
        break;

      default:
        return false;
    }

    if (sub) {
      this.eventSubSubs.set(eventName, sub);
      console.log(`[twitch] EventSub subscribed: ${eventName}`);
      return true;
    }
    return false;
  }

  unsubscribeEventSub(eventName: string): boolean {
    const sub = this.eventSubSubs.get(eventName);
    if (!sub) return false;
    sub.stop();
    this.eventSubSubs.delete(eventName);
    console.log(`[twitch] EventSub unsubscribed: ${eventName}`);
    return true;
  }

  stopAllEventSub(): void {
    for (const [name, sub] of this.eventSubSubs) {
      sub.stop();
      console.log(`[twitch] EventSub unsubscribed: ${name}`);
    }
    this.eventSubSubs.clear();
  }
}
