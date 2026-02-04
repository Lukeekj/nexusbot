const { Client, GatewayIntentBits, Collection, ChannelType, PermissionsBitField, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Servidor para manter o Replit acordado
const http = require('http');
http.createServer((req, res) => { res.write('NEXUS APOSTAS ONLINE'); res.end(); }).listen(8080);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

// Configurações Iniciais do Bot
let botConfig = {
  LOGO_URL: "https://i.imgur.com/vH9X6N8.png",
  EMBED_COLOR: "#FFD700",
  DESCRIPTION_TEXT: "Clique no botão abaixo para entrar na fila e encontrar seu adversário!",
  TAXA_ADM: 0.25
};

let pixKeys = {};
let activeBets = new Collection();
const playerQueue = [];
const mediatorQueue = [];
const adminBetSelections = new Collection();

const DATA_FILE = './database.json';

// Funções de Persistência
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      pixKeys = data.pixKeys || {};
      if (data.mediatorQueue) mediatorQueue.push(...data.mediatorQueue);
      botConfig = { ...botConfig, ...(data.botConfig || {}) };
    }
  } catch (e) { console.log("Erro ao carregar banco de dados."); }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ pixKeys, mediatorQueue, botConfig }));
  } catch (e) { console.log("Erro ao salvar banco de dados."); }
}

client.once('ready', async () => {
  console.log(`🚀 NEXUS APOSTAS: Logado como ${client.user.tag}`);
  loadData();
  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) {
    await guild.commands.set([
      new SlashCommandBuilder().setName('painel_aposta').setDescription('Abre o painel de criação de apostas.').toJSON(),
      new SlashCommandBuilder().setName('setpix').setDescription('Configura sua própria chave PIX.').addStringOption(o => o.setName('chave').setDescription('Sua chave PIX').setRequired(true)).toJSON(),
      new SlashCommandBuilder().setName('pix_adm').setDescription('Define a chave PIX de um membro específico.').addUserOption(o => o.setName('membro').setDescription('O ADM/Membro').setRequired(true)).addStringOption(o => o.setName('chave').setDescription('A chave PIX').setRequired(true)).toJSON(),
      new SlashCommandBuilder().setName('fila_mediadores').setDescription('Entra ou sai da fila de mediadores.').addStringOption(o => o.setName('acao').setDescription('Escolha entrar ou sair').setRequired(true).addChoices({name:'Entrar',value:'entrar'},{name:'Sair',value:'sair'})).toJSON(),
      new SlashCommandBuilder().setName('ver_fila_mediadores').setDescription('Mostra a fila atual de mediadores.').toJSON(),
      new SlashCommandBuilder().setName('config_bot').setDescription('Configura o visual do bot.').addStringOption(o => o.setName('cor').setDescription('Cor em Hexadecimal (Ex: #FF0000)')).addStringOption(o => o.setName('logo').setDescription('Link da imagem da Logo')).addStringOption(o => o.setName('desc').setDescription('Texto da descrição')).addNumberOption(o => o.setName('taxa').setDescription('Valor da taxa ADM (Ex: 0.25)')).toJSON(),
    ]);
  }
});

client.on('interactionCreate', async (interaction) => {
  // --- COMANDOS SLASH ---
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'painel_aposta') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '❌ Você não tem permissão de ADM.', ephemeral: true });
      
      const row1 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('sel_modo').setPlaceholder('🎮 Escolha o Modo de Jogo').addOptions(
          {label:'1x1',value:'1x1'},{label:'2x2',value:'2x2'},{label:'3x3',value:'3x3'},{label:'4x4',value:'4x4'}
        )
      );
      const row2 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('sel_valor').setPlaceholder('💰 Escolha o Valor da Aposta').addOptions(
          {label:'R$0,50',value:'0.50'},{label:'R$1,00',value:'1.00'},{label:'R$2,00',value:'2.00'},{label:'R$3,00',value:'3.00'},{label:'R$5,00',value:'5.00'},{label:'R$10,00',value:'10.00'},{label:'R$20,00',value:'20.00'},{label:'R$50,00',value:'50.00'},{label:'R$100,00',value:'100.00'}
        )
      );
      const row3 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('sel_tipo').setPlaceholder('📱 Escolha o Tipo de Jogador').addOptions(
          {label:'Mobile',value:'Mobile'},{label:'Emulador',value:'Emulador'},{label:'Tático',value:'Tático'}
        )
      );
      const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_panel').setLabel('Postar Aposta Pública').setStyle(ButtonStyle.Success).setEmoji('✅')
      );

      await interaction.reply({ content: '⚙️ **Configuração de Partida:**', components: [row1, row2, row3, row4], ephemeral: true });
      adminBetSelections.set(interaction.user.id, { modo: '1x1', valor: '0.50', tipo: 'Mobile' });
    }

    if (interaction.commandName === 'setpix') {
      pixKeys[interaction.user.id] = interaction.options.getString('chave');
      saveData();
      await interaction.reply({ content: `✅ Sua chave PIX foi configurada: \`${pixKeys[interaction.user.id]}\``, ephemeral: true });
    }

    if (interaction.commandName === 'pix_adm') {
      const membro = interaction.options.getUser('membro');
      pixKeys[membro.id] = interaction.options.getString('chave');
      saveData();
      await interaction.reply({ content: `✅ Chave PIX de <@${membro.id}> definida com sucesso!`, ephemeral: true });
    }

    if (interaction.commandName === 'fila_mediadores') {
      const acao = interaction.options.getString('acao');
      if (acao === 'entrar') {
        if (mediatorQueue.find(m => m.id === interaction.user.id)) return interaction.reply({ content: '❌ Você já está na fila!', ephemeral: true });
        mediatorQueue.push({ id: interaction.user.id, name: interaction.user.username });
      } else {
        const idx = mediatorQueue.findIndex(m => m.id === interaction.user.id);
        if (idx !== -1) mediatorQueue.splice(idx, 1);
      }
      saveData();
      await interaction.reply({ content: `📢 Fila de Mediadores atualizada!`, ephemeral: true });
    }

    if (interaction.commandName === 'ver_fila_mediadores') {
      const embed = new EmbedBuilder()
        .setTitle('👮 FILA DE MEDIADORES - NEXUS')
        .setColor(botConfig.EMBED_COLOR)
        .setThumbnail(botConfig.LOGO_URL)
        .setTimestamp();
      
      const text = mediatorQueue.length > 0 
        ? mediatorQueue.map((m, i) => `**${i+1}º Lugar** - <@${m.id}>`).join('\n') 
        : '*Fila vazia no momento.*';
      
      embed.setDescription(text);
      await interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'config_bot') {
      const cor = interaction.options.getString('cor');
      const logo = interaction.options.getString('logo');
      const desc = interaction.options.getString('desc');
      const taxa = interaction.options.getNumber('taxa');
      if (cor) botConfig.EMBED_COLOR = cor;
      if (logo) botConfig.LOGO_URL = logo;
      if (desc) botConfig.DESCRIPTION_TEXT = desc;
      if (taxa !== null) botConfig.TAXA_ADM = taxa;
      saveData();
      await interaction.reply({ content: '✅ Configurações do bot atualizadas!', ephemeral: true });
    }
  }

  // --- SELEÇÕES DO MENU ---
  if (interaction.isStringSelectMenu()) {
    const sel = adminBetSelections.get(interaction.user.id);
    if (!sel) return;
    if (interaction.customId === 'sel_modo') sel.modo = interaction.values[0];
    if (interaction.customId === 'sel_valor') sel.valor = interaction.values[0];
    if (interaction.customId === 'sel_tipo') sel.tipo = interaction.values[0];
    await interaction.update({ content: `⚙️ **Configurando:** ${sel.modo} | R$${sel.valor} | ${sel.tipo}` });
  }

  // --- BOTÕES ---
  if (interaction.isButton()) {
    const [action, ...args] = interaction.customId.split('_');
    
    // Postar painel público
    if (action === 'confirm' && args[0] === 'panel') {
      const sel = adminBetSelections.get(interaction.user.id);
      const embedPublica = new EmbedBuilder()
        .setTitle('🔥 NOVA APOSTA DISPONÍVEL 🔥')
        .setColor(botConfig.EMBED_COLOR)
        .setThumbnail(botConfig.LOGO_URL)
        .setDescription(botConfig.DESCRIPTION_TEXT)
        .addFields(
          { name: '🎮 Modo', value: `\`${sel.modo}\``, inline: true },
          { name: '💰 Valor', value: `\`R$ ${sel.valor}\``, inline: true },
          { name: '📱 Tipo', value: `\`${sel.tipo}\``, inline: true }
        )
        .setFooter({ text: 'Clique abaixo para entrar na disputa!' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`join_${sel.modo}_${sel.valor}_${sel.tipo}`).setLabel('Entrar na Fila').setStyle(ButtonStyle.Primary).setEmoji('➡️'),
        new ButtonBuilder().setCustomId('leave_queue').setLabel('Sair da Fila').setStyle(ButtonStyle.Danger)
      );

      await interaction.channel.send({ embeds: [embedPublica], components: [row] });
      await interaction.update({ content: '✅ Aposta postada com sucesso!', components: [] });
    }

    // Entrar na fila de jogadores
    if (action === 'join') {
      if (playerQueue.find(p => p.id === interaction.user.id)) return interaction.reply({ content: '❌ Você já está na fila!', ephemeral: true });
      playerQueue.push({ id: interaction.user.id, user: interaction.user, modo: args[0], valor: args[1], tipo: args[2] });
      
      await interaction.reply({ content: `✅ <@${interaction.user.id}> entrou na fila! Aguardando oponente...`, ephemeral: false });
      
      if (playerQueue.length >= 2) {
        const p1 = playerQueue.shift();
        const p2 = playerQueue.shift();
        
        // Mediador Automático (Primeiro da fila)
        const med = mediatorQueue.shift();
        if (med) mediatorQueue.push(med); // Vai para o fim da fila
        saveData();

        const guild = interaction.guild;
        const channel = await guild.channels.create({
          name: `💸-${p1.modo}-${p1.user.username}-vs-${p2.user.username}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: p1.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: p2.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            ...(med ? [{ id: med.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : [])
          ]
        });
        
        const betId = channel.id;
        activeBets.set(betId, { p1: p1.id, p2: p2.id, med: med?.id, valor: p1.valor, p1Conf: false, p2Conf: false });
        
        const embedPartida = new EmbedBuilder()
          .setTitle('🚀 PARTIDA INICIADA')
          .setColor(botConfig.EMBED_COLOR)
          .setThumbnail(botConfig.LOGO_URL)
          .addFields(
            { name: '👤 Jogador 1', value: `<@${p1.id}>`, inline: true },
            { name: '👤 Jogador 2', value: `<@${p2.id}>`, inline: true },
            { name: '👮 Mediador', value: med ? `<@${med.id}>` : '*Nenhum ADM na fila*', inline: true }
          )
          .setDescription('**Ambos os jogadores precisam confirmar para ver o PIX.**');

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`conf_1_${betId}`).setLabel(`Confirmar (${p1.user.username})`).setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`conf_2_${betId}`).setLabel(`Confirmar (${p2.user.username})`).setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`cancel_${betId}`).setLabel('Cancelar Partida').setStyle(ButtonStyle.Danger)
        );

        await channel.send({ content: `<@${p1.id}> <@${p2.id}> ${med ? `<@${med.id}>` : ''}`, embeds: [embedPartida], components: [row] });
      }
    }

    // Sair da fila de jogadores
    if (action === 'leave') {
      const idx = playerQueue.findIndex(p => p.id === interaction.user.id);
      if (idx !== -1) {
        playerQueue.splice(idx, 1);
        await interaction.reply({ content: '👋 Você saiu da fila.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'Você não está na fila.', ephemeral: true });
      }
    }

    // Confirmação de Jogadores no Canal
    if (action === 'conf') {
      const bet = activeBets.get(args[1]);
      if (!bet) return;

      if (args[0] === '1' && interaction.user.id === bet.p1) bet.p1Conf = true;
      if (args[0] === '2' && interaction.user.id === bet.p2) bet.p2Conf = true;
      
      await interaction.reply({ content: '✅ Você confirmou a aposta!', ephemeral: true });
      
      if (bet.p1Conf && bet.p2Conf) {
        const pix = pixKeys[bet.med] || 'Chave não configurada pelo ADM.';
        const valorBase = parseFloat(bet.valor);
        const total = (valorBase + botConfig.TAXA_ADM).toFixed(2);
        
        const qr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pix)}`;
        
        const embedPix = new EmbedBuilder()
          .setTitle('💵 PAGAMENTO DA APOSTA')
          .setColor('#00FF00')
          .setThumbnail(botConfig.LOGO_URL)
          .setDescription(`O pagamento deve ser feito para o mediador da partida.`)
          .addFields(
            { name: '🔑 Chave PIX', value: `\`${pix}\`` },
            { name: '💰 Valor Total', value: `\`R$ ${total}\` (Aposta: R$${valorBase.toFixed(2)} + Taxa: R$${botConfig.TAXA_ADM.toFixed(2)})` }
          )
          .setImage(qr)
          .setFooter({ text: 'Envie o comprovante neste canal após pagar.' });

        await interaction.channel.send({ embeds: [embedPix] });
      }
    }

    // Cancelar partida
    if (action === 'cancel') {
      await interaction.channel.send('❌ **Partida Cancelada.** O canal será excluído em 5 segundos...');
      setTimeout(() => interaction.channel.delete(), 5000);
    }
  }
});

client.login(TOKEN);
l