import { ipcMain, app } from "electron";
import Discord from "@owlbear-rodeo/discord.js";

export class DiscordBroadcast {
  client: Discord.Client;
  broadcast: Discord.VoiceBroadcast;
  constructor() {
    this.client = new Discord.Client();
    if (this.client.voice) {
      this.broadcast = this.client.voice.createBroadcast();
    } else {
      throw Error("No voice available for discord client");
    }
    ipcMain.on("DISCORD_CONNECT", this._handleConnect);
    ipcMain.on("DISCORD_DISCONNECT", this._handleDisconnect);
    ipcMain.on("DISCORD_JOIN_CHANNEL", this._handleJoinChannel);
  }

  destroy() {
    ipcMain.off("DISCORD_CONNECT", this._handleConnect);
    ipcMain.off("DISCORD_DISCONNECT", this._handleDisconnect);
    ipcMain.off("DISCORD_JOIN_CHANNEL", this._handleJoinChannel);
    this.client.destroy();
  }

  _handleConnect = async (event: Electron.IpcMainEvent, token: string) => {
    if (!token) {
      event.reply("DISCORD_DISCONNECTED");
      event.reply("ERROR", "Error connecting to bot: Invalid token");
      return;
    }

    try {
      const onReady = () => {
        event.reply("DISCORD_READY");
        event.reply("MESSAGE", "Connected");
        const voiceChannels = [{ id: "local", name: "This Computer" }];
        this.client.channels.cache.forEach((channel) => {
          if (channel.type === "voice") {
            voiceChannels.push({ id: channel.id, name: (channel as any).name });
          }
        });
        event.reply("DISCORD_VOICE_CHANNELS", voiceChannels);
      };
      const ready = this.client.readyTimestamp !== null;
      if (!ready) {
        this.client.once("ready", onReady);
      }
      await this.client.login(token);
      if (ready) {
        onReady();
      }
    } catch (err) {
      event.reply("DISCORD_DISCONNECTED");
      event.reply("ERROR", `Error connecting to bot: ${err.message}`);
    }
  };

  _handleDisconnect = async (event: Electron.IpcMainEvent) => {
    this.client.voice?.connections.forEach((connection) => {
      connection.disconnect();
    });
    event.reply("DISCORD_DISCONNECTED");
    event.reply("DISCORD_VOICE_CHANNELS", [
      { id: "local", name: "This Computer" },
    ]);
    event.reply("DISCORD_CHANNEL_JOINED", "local");
    this.client.destroy();
  };

  _handleJoinChannel = async (
    event: Electron.IpcMainEvent,
    channelId: string
  ) => {
    this.client.voice?.connections.forEach((connection) => {
      connection.disconnect();
    });
    if (channelId !== "local") {
      const channel = await this.client.channels.fetch(channelId);
      if (channel instanceof Discord.VoiceChannel) {
        const connection = await channel.join();
        connection.play(this.broadcast);
        connection.once("disconnect", () => {
          event.reply("DISCORD_CHANNEL_LEFT", channelId);
        });
        event.reply("DISCORD_CHANNEL_JOINED", channelId);
      }
    }
  };
}
