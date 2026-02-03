const { Client, GatewayIntentBits, Collection, ChannelType, PermissionsBitField, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
});

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

let pixKeys = {};
let activeBets = new Collection();
const playerQueue = [];

client.once('ready', async () => {
  console.log(`Bot NEXUS online como ${client.user.tag}`);
  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) {
    await guild.commands.set([
      { name: 'apostar', description: 'Entra na fila de apostas.' },
      { name: 'setpix', description: 'Configura sua chave PIX.', options: [{ name: 'chave', type: 3, description: 'Sua chave PIX', required: true }] }
    ]);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'apostar') {
      if (playerQueue.some(p => p.userId === interaction.user.id)) return interaction.reply({ content: 'Já está na fila.', ephemeral: true });
      playerQueue.push({ userId: interaction.user.id, username: interaction.user.username, interaction });
      await interaction.reply({ content: 'Você entrou na fila!', ephemeral: true });
      if (playerQueue.length >= 2) {
        const p1 = playerQueue.shift();
        const p2 = playerQueue.shift();
        const channel = await interaction.guild.channels.create({
          name: `partida-${p1.username}-${p2.username}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: p1.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: p2.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          ],
        });
        activeBets.set(channel.id, { player1Id: p1.userId, player2Id: p2.userId, staffId: null });
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`claim_${channel.id}`).setLabel('Assumir Partida').setStyle(ButtonStyle.Primary));
        await channel.send({ content: `Partida: <@<LaTex>${p1.userId}> vs <@$</LaTex>{p2.userId}>. Staff, assuma:`, components: [row] });
      }
    }
    if (interaction.commandName === 'setpix') {
      pixKeys[interaction.user.id] = interaction.options.getString('chave');
      await interaction.reply({ content: `PIX configurado: ${pixKeys[interaction.user.id]}`, ephemeral: true });
    }
  }
  if (interaction.isButton()) {
    const [action, betId] = interaction.customId.split('_');
    if (action === 'claim') {
      const bet = activeBets.get(betId);
      bet.staffId = interaction.user.id;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`confirm_${betId}`).setLabel('Confirmar').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`reject_<LaTex>${betId}`).setLabel('Rejeitar').setStyle(ButtonStyle.Danger)
      );
      await interaction.update({ content: `Assumida por <@$</LaTex>{interaction.user.id}>. Confirmem:`, components: [row] });
    }
    if (action === 'confirm') {
      const bet = activeBets.get(betId);
      const staffPix = pixKeys[bet.staffId];
      if (!staffPix) return interaction.reply({ content: 'Staff sem PIX.', ephemeral: true });
      const qr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=<LaTex>${encodeURIComponent(staffPix)}`;
      const embed = new EmbedBuilder().setTitle('PAGAMENTO PIX').setImage(qr).setDescription(`Chave: $</LaTex>{staffPix}`).setColor('#00FF00');
      await interaction.update({ content: 'Aposta Confirmada!', embeds: [embed], components: [] });
    }
    if (action === 'reject') {
      await interaction.channel.delete();
    }
  }
});

client.login(TOKEN);
