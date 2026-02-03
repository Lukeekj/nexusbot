const { Client, GatewayIntentBits, Collection, ChannelType, PermissionsBitField, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
});

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const LOGO_URL = "https://i.imgur.com/vH9X6N8.png"; // Você pode trocar pelo link da sua logo

let pixKeys = {};
let activeBets = new Collection();
const playerQueue = [];

client.once('ready', async () => {
  console.log(`Bot NEXUS online como ${client.user.tag}`);
  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) {
    await guild.commands.set([
      { name: 'apostar', description: 'Entra na fila de apostas do NEXUS.' },
      { name: 'setpix', description: 'Configura sua chave PIX de ADM.', options: [{ name: 'chave', type: 3, description: 'Sua chave PIX', required: true }] }
    ]);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'apostar') {
      if (playerQueue.some(p => p.userId === interaction.user.id)) return interaction.reply({ content: '❌ Você já está na fila.', ephemeral: true });
      playerQueue.push({ userId: interaction.user.id, username: interaction.user.username, interaction });
      
      const embedFila = new EmbedBuilder()
        .setTitle('🎮 FILA NEXUS APOSTAS')
        .setDescription(`<@${interaction.user.id}>, você entrou na fila!\n\n**Aguardando:** 1/2 jogadores.`)
        .setColor('#00FF00');
        
      await interaction.reply({ embeds: [embedFila], ephemeral: true });

      if (playerQueue.length >= 2) {
        const p1 = playerQueue.shift();
        const p2 = playerQueue.shift();
        
        const channel = await interaction.guild.channels.create({
          name: `💸-aposta-<LaTex>${p1.username}-$</LaTex>{p2.username}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: p1.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: p2.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          ],
        });

        activeBets.set(channel.id, { player1Id: p1.userId, player2Id: p2.userId, staffId: null });

        const embedPartida = new EmbedBuilder()
          .setTitle('🚀 NOVA PARTIDA ENCONTRADA')
          .setThumbnail(LOGO_URL)
          .addFields(
            { name: '👤 Jogador 1', value: `<@<LaTex>${p1.userId}>`, inline: true },
            { name: '👤 Jogador 2', value: `<@$</LaTex>{p2.userId}>`, inline: true },
            { name: '💰 Valor Base', value: 'R$ 10,00', inline: false }
          )
          .setDescription('**Aguardando um ADM assumir a partida para gerar o pagamento.**')
          .setColor('#5865F2')
          .setFooter({ text: 'NEXUS APOSTAS - O melhor sistema de Free Fire' });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`claim_${channel.id}`).setLabel('Assumir Partida').setStyle(ButtonStyle.Primary).setEmoji('👮')
        );

        await channel.send({ content: `<@<LaTex>${p1.userId}> <@$</LaTex>{p2.userId}>`, embeds: [embedPartida], components: [row] });
      }
    }
    if (interaction.commandName === 'setpix') {
      pixKeys[interaction.user.id] = interaction.options.getString('chave');
      await interaction.reply({ content: `✅ **Sucesso!** Sua chave PIX foi configurada para: \`${pixKeys[interaction.user.id]}\``, ephemeral: true });
    }
  }

  if (interaction.isButton()) {
    const [action, betId] = interaction.customId.split('_');
    if (action === 'claim') {
      const bet = activeBets.get(betId);
      bet.staffId = interaction.user.id;
      
      const embedConfirm = new EmbedBuilder()
        .setTitle('✅ PARTIDA ASSUMIDA')
        .setDescription(`O ADM <@${interaction.user.id}> assumiu esta partida.\n\n**Jogadores, confirmem a aposta abaixo para gerar o PIX.**`)
        .setColor('#FFFF00');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`confirm_<LaTex>${betId}`).setLabel('Confirmar Aposta').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId(`reject_$</LaTex>{betId}`).setLabel('Cancelar').setStyle(ButtonStyle.Danger).setEmoji('❌')
      );
      await interaction.update({ embeds: [embedConfirm], components: [row] });
    }
    
    if (action === 'confirm') {
      const bet = activeBets.get(betId);
      const staffPix = pixKeys[bet.staffId];
      if (!staffPix) return interaction.reply({ content: '❌ Este ADM ainda não configurou o PIX dele!', ephemeral: true });
      
      const qr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(staffPix)}`;
      
      const embedPix = new EmbedBuilder()
        .setTitle('💵 PAGAMENTO DA APOSTA')
        .setThumbnail(LOGO_URL)
        .setDescription('Escaneie o QR Code abaixo ou copie a chave PIX para realizar o pagamento.')
        .addFields(
          { name: '🔑 Chave PIX', value: `\`${staffPix}\`` },
          { name: '💰 Valor', value: 'R<LaTex>$ 10,00' },
          { name: '👤 ADM Responsável', value: `<@$</LaTex>{bet.staffId}>` }
        )
        .setImage(qr)
        .setColor('#00FF00')
        .setFooter({ text: 'Após o pagamento, envie o comprovante aqui no chat.' });

      await interaction.update({ embeds: [embedPix], components: [] });
    }
    
    if (action === 'reject') {
      await interaction.channel.send('❌ Partida cancelada. O canal será excluído...');
      setTimeout(() => interaction.channel.delete(), 5000);
    }
  }
});

client.login(TOKEN);
