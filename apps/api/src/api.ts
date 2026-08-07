import type { AuthProvider } from "@twurple/auth";
import { ApiClient } from "@twurple/api";

export class TwitchApi {
  protected api: ApiClient;

  constructor(authProvider: AuthProvider) {
    this.api = new ApiClient({ authProvider });
  }

  // ── Channel ────────────────────────────────────────────────────────

  async getChannelInfo(broadcasterId: string) {
    const info = await this.api.channels.getChannelInfoById(broadcasterId);
    if (!info) return null;
    return {
      id: info.id,
      name: info.name,
      display_name: info.displayName,
      game_id: info.gameId,
      game_name: info.gameName,
      title: info.title,
      language: info.language,
      tags: info.tags,
    };
  }

  async updateChannelInfo(broadcasterId: string, data: { title?: string; game_id?: string; language?: string; tags?: string[] }) {
    await this.api.channels.updateChannelInfo(broadcasterId, {
      title: data.title,
      gameId: data.game_id,
      language: data.language,
      tags: data.tags,
    });
  }

  async getChannelFollowerCount(broadcasterId: string): Promise<number> {
    return this.api.channels.getChannelFollowerCount(broadcasterId);
  }

  async startCommercial(broadcasterId: string, length: number) {
    await this.api.channels.startChannelCommercial(broadcasterId, length as 30 | 60 | 90 | 120 | 150 | 180);
  }

  // ── Streams ────────────────────────────────────────────────────────

  async getStreamByUserId(userId: string) {
    const stream = await this.api.streams.getStreamByUserId(userId);
    if (!stream) return null;
    return {
      id: stream.id,
      user_id: stream.userId,
      user_name: stream.userName,
      user_display_name: stream.userDisplayName,
      game_id: stream.gameId,
      game_name: stream.gameName,
      title: stream.title,
      viewer_count: stream.viewers,
      started_at: stream.startDate.toISOString(),
      language: stream.language,
      is_mature: stream.isMature,
      tags: stream.tags,
    };
  }

  async getStreamByUserName(userName: string) {
    const stream = await this.api.streams.getStreamByUserName(userName);
    if (!stream) return null;
    return {
      id: stream.id,
      user_id: stream.userId,
      user_name: stream.userName,
      user_display_name: stream.userDisplayName,
      game_id: stream.gameId,
      game_name: stream.gameName,
      title: stream.title,
      viewer_count: stream.viewers,
      started_at: stream.startDate.toISOString(),
      language: stream.language,
      is_mature: stream.isMature,
      tags: stream.tags,
    };
  }

  async createStreamMarker(broadcasterId: string, description?: string) {
    const marker = await this.api.streams.createStreamMarker(broadcasterId, description);
    return {
      id: marker.id,
      created_at: marker.creationDate.toISOString(),
      position_seconds: marker.positionInSeconds,
    };
  }

  // ── Users ──────────────────────────────────────────────────────────

  async getUserById(userId: string) {
    const user = await this.api.users.getUserById(userId);
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      display_name: user.displayName,
      description: user.description,
      profile_image_url: user.profilePictureUrl,
      created_at: user.creationDate.toISOString(),
      type: user.type,
      broadcaster_type: user.broadcasterType,
    };
  }

  async getUserByName(userName: string) {
    const user = await this.api.users.getUserByName(userName);
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      display_name: user.displayName,
      description: user.description,
      profile_image_url: user.profilePictureUrl,
      created_at: user.creationDate.toISOString(),
      type: user.type,
      broadcaster_type: user.broadcasterType,
    };
  }

  // ── Games ──────────────────────────────────────────────────────────

  async getGameByName(name: string) {
    const game = await this.api.games.getGameByName(name);
    if (!game) return null;
    return {
      id: game.id,
      name: game.name,
      box_art_url: game.boxArtUrl,
      igdb_id: game.igdbId,
    };
  }

  async getGameById(gameId: string) {
    const game = await this.api.games.getGameById(gameId);
    if (!game) return null;
    return {
      id: game.id,
      name: game.name,
      box_art_url: game.boxArtUrl,
      igdb_id: game.igdbId,
    };
  }

  async getTopGames(limit: number = 20) {
    const result = await this.api.games.getTopGames({ limit });
    return result.data.map((g) => ({
      id: g.id,
      name: g.name,
      box_art_url: g.boxArtUrl,
      igdb_id: g.igdbId,
    }));
  }

  // ── Clips ──────────────────────────────────────────────────────────

  async createClip(broadcasterId: string) {
    const clipId = await this.api.clips.createClip({ channel: broadcasterId });
    return { clip_id: clipId };
  }

  async getClipById(clipId: string) {
    const clip = await this.api.clips.getClipById(clipId);
    if (!clip) return null;
    return {
      id: clip.id,
      url: clip.url,
      embed_url: clip.embedUrl,
      broadcaster_id: clip.broadcasterId,
      broadcaster_display_name: clip.broadcasterDisplayName,
      creator_id: clip.creatorId,
      creator_display_name: clip.creatorDisplayName,
      game_id: clip.gameId,
      title: clip.title,
      view_count: clip.views,
      created_at: clip.creationDate.toISOString(),
      thumbnail_url: clip.thumbnailUrl,
      duration: clip.duration,
    };
  }

  // ── Moderation ─────────────────────────────────────────────────────

  async banUser(broadcasterId: string, userId: string, reason?: string) {
    await this.api.moderation.banUser(broadcasterId, { user: userId, reason: reason ?? "" });
  }

  async timeoutUser(broadcasterId: string, userId: string, duration: number, reason?: string) {
    await this.api.moderation.banUser(broadcasterId, { user: userId, duration, reason: reason ?? "" });
  }

  async unbanUser(broadcasterId: string, userId: string) {
    await this.api.moderation.unbanUser(broadcasterId, userId);
  }

  async getModerators(broadcasterId: string) {
    const result = await this.api.moderation.getModerators(broadcasterId);
    return result.data.map((m) => ({
      user_id: m.userId,
      user_name: m.userName,
      user_display_name: m.userDisplayName,
    }));
  }

  async getBannedUsers(broadcasterId: string) {
    const result = await this.api.moderation.getBannedUsers(broadcasterId);
    return result.data.map((b) => ({
      user_id: b.userId,
      user_name: b.userName,
      user_display_name: b.userDisplayName,
      reason: b.reason,
      created_at: b.creationDate.toISOString(),
      expires_at: b.expiryDate?.toISOString() ?? null,
    }));
  }

  async addModerator(broadcasterId: string, userId: string) {
    await this.api.moderation.addModerator(broadcasterId, userId);
  }

  async removeModerator(broadcasterId: string, userId: string) {
    await this.api.moderation.removeModerator(broadcasterId, userId);
  }

  async deleteChatMessages(broadcasterId: string, messageId?: string) {
    await this.api.moderation.deleteChatMessages(broadcasterId, messageId);
  }

  async shieldModeStatus(broadcasterId: string) {
    const status = await this.api.moderation.getShieldModeStatus(broadcasterId);
    return {
      is_active: status.isActive,
      last_activated_at: status.lastActivationDate?.toISOString() ?? null,
    };
  }

  async updateShieldMode(broadcasterId: string, activate: boolean) {
    const status = await this.api.moderation.updateShieldModeStatus(broadcasterId, activate);
    return {
      is_active: status.isActive,
      last_activated_at: status.lastActivationDate?.toISOString() ?? null,
    };
  }

  // ── Polls ──────────────────────────────────────────────────────────

  async createPoll(broadcasterId: string, title: string, choices: string[], duration: number) {
    const poll = await this.api.polls.createPoll(broadcasterId, {
      title,
      choices,
      duration,
    });
    return {
      id: poll.id,
      title: poll.title,
      choices: poll.choices.map((c) => ({
        id: c.id,
        title: c.title,
        votes: c.totalVotes,
      })),
      status: poll.status,
      started_at: poll.startDate.toISOString(),
      ended_at: poll.endDate?.toISOString() ?? null,
    };
  }

  async endPoll(broadcasterId: string, pollId: string, showResult: boolean = true) {
    const poll = await this.api.polls.endPoll(broadcasterId, pollId, showResult);
    return {
      id: poll.id,
      title: poll.title,
      choices: poll.choices.map((c) => ({
        id: c.id,
        title: c.title,
        votes: c.totalVotes,
      })),
      status: poll.status,
      started_at: poll.startDate.toISOString(),
      ended_at: poll.endDate?.toISOString() ?? null,
    };
  }

  // ── Predictions ────────────────────────────────────────────────────

  async createPrediction(broadcasterId: string, title: string, outcomes: string[], duration: number) {
    const pred = await this.api.predictions.createPrediction(broadcasterId, {
      title,
      outcomes,
      autoLockAfter: duration,
    });
    return {
      id: pred.id,
      title: pred.title,
      outcomes: pred.outcomes.map((o) => ({
        id: o.id,
        title: o.title,
        users: o.users,
        channel_points: o.totalChannelPoints,
      })),
      status: pred.status,
      created_at: pred.creationDate.toISOString(),
    };
  }

  async lockPrediction(broadcasterId: string, predictionId: string) {
    const pred = await this.api.predictions.lockPrediction(broadcasterId, predictionId);
    return { id: pred.id, status: pred.status };
  }

  async resolvePrediction(broadcasterId: string, predictionId: string, outcomeId: string) {
    const pred = await this.api.predictions.resolvePrediction(broadcasterId, predictionId, outcomeId);
    return { id: pred.id, status: pred.status };
  }

  async cancelPrediction(broadcasterId: string, predictionId: string) {
    const pred = await this.api.predictions.cancelPrediction(broadcasterId, predictionId);
    return { id: pred.id, status: pred.status };
  }

  // ── Raids ──────────────────────────────────────────────────────────

  async startRaid(fromId: string, toId: string) {
    const raid = await this.api.raids.startRaid(fromId, toId);
    return { created_at: raid.creationDate.toISOString() };
  }

  async cancelRaid(broadcasterId: string) {
    await this.api.raids.cancelRaid(broadcasterId);
  }

  // ── Search ─────────────────────────────────────────────────────────

  async searchChannels(query: string, limit: number = 20) {
    const result = await this.api.search.searchChannels(query, { limit });
    return result.data.map((c) => ({
      id: c.id,
      name: c.name,
      display_name: c.displayName,
      game_id: c.gameId,
      game_name: c.gameName,
      language: c.language,
      is_live: c.isLive,
      tags: c.tags,
    }));
  }

  async searchCategories(query: string, limit: number = 20) {
    const result = await this.api.search.searchCategories(query, { limit });
    return result.data.map((g) => ({
      id: g.id,
      name: g.name,
      box_art_url: g.boxArtUrl,
    }));
  }

  // ── Whispers ───────────────────────────────────────────────────────

  async sendWhisper(fromId: string, toId: string, message: string) {
    await this.api.whispers.sendWhisper(fromId, toId, message);
  }

  // ── Channel Points ─────────────────────────────────────────────────

  async getCustomRewards(broadcasterId: string) {
    const rewards = await this.api.channelPoints.getCustomRewards(broadcasterId);
    return rewards.map((r) => ({
      id: r.id,
      title: r.title,
      cost: r.cost,
      prompt: r.prompt,
      is_enabled: r.isEnabled,
      is_paused: r.isPaused,
      background_color: r.backgroundColor,
      auto_fulfill: r.autoFulfill,
    }));
  }

  async createCustomReward(broadcasterId: string, data: { title: string; cost: number; prompt?: string; is_enabled?: boolean; background_color?: string; auto_fulfill?: boolean }) {
    const reward = await this.api.channelPoints.createCustomReward(broadcasterId, {
      title: data.title,
      cost: data.cost,
      prompt: data.prompt,
      isEnabled: data.is_enabled,
      backgroundColor: data.background_color,
      autoFulfill: data.auto_fulfill,
    });
    return {
      id: reward.id,
      title: reward.title,
      cost: reward.cost,
      prompt: reward.prompt,
      is_enabled: reward.isEnabled,
    };
  }

  // ── VIPs ───────────────────────────────────────────────────────────

  async getVips(broadcasterId: string) {
    const result = await this.api.channels.getVips(broadcasterId);
    return result.data.map((v) => ({
      user_id: v.id,
      user_name: v.name,
      user_display_name: v.displayName,
    }));
  }

  async addVip(broadcasterId: string, userId: string) {
    await this.api.channels.addVip(broadcasterId, userId);
  }

  async removeVip(broadcasterId: string, userId: string) {
    await this.api.channels.removeVip(broadcasterId, userId);
  }

  // ── Chat API ───────────────────────────────────────────────────────

  async getChatters(broadcasterId: string) {
    const result = await this.api.chat.getChatters(broadcasterId);
    return {
      total: result.total,
      chatters: result.data.map((c) => ({
        user_id: c.userId,
        user_name: c.userName,
        user_display_name: c.userDisplayName,
      })),
    };
  }

  async sendAnnouncement(broadcasterId: string, message: string, color?: string) {
    await this.api.chat.sendAnnouncement(broadcasterId, {
      message,
      color: color as "primary" | "blue" | "green" | "orange" | "purple" | undefined,
    });
  }

  async shoutoutUser(fromId: string, toId: string) {
    await this.api.chat.shoutoutUser(fromId, toId);
  }

  // ── Subscriptions ──────────────────────────────────────────────────

  async getSubscriptionCount(broadcasterId: string) {
    const result = await this.api.subscriptions.getSubscriptions(broadcasterId);
    return { total: result.total, points: result.points };
  }

  // ── Bits ───────────────────────────────────────────────────────────

  async getBitsLeaderboard(broadcasterId: string, count: number = 10) {
    const board = await this.api.bits.getLeaderboard(broadcasterId, { count });
    return board.entries.map((e) => ({
      user_id: e.userId,
      user_name: e.userName,
      user_display_name: e.userDisplayName,
      rank: e.rank,
      score: e.amount,
    }));
  }
}
