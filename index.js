const { Client, GatewayIntentBits, Collection, ChannelType, PermissionsBitField, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
require("dotenv").config();

// Servidor para manter o Replit acordado
const http = require('http');
http.createServer((req, res) => { res.write('NEXUS APOSTAS ONLINE'); res.end(); }).listen(8080);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
});

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

let botConfig = {
  LOGO_URL: "https://i.imgur.com/vH9X6N8.png",
  EMBED_COLOR: "#FFD700",
  DESCRIPTION_TEXT: "Clique no botão abaixo para entrar na fila!",
  TAXA_ADM: 0.25
};

let pixKeys = {};
let activeBets = new Collection();
let playerQueue = []; // { id, user, modo, valor, tipo, messageId }
let mediatorQueue = [];
const adminSelections = new Collection();

const DATA_FILE = './database.json';

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      pixKeys = data.pixKeys || {};
      mediatorQueue = data.mediatorQueue || [];
      botConfig = { ...botConfig, ...(data.botConfig || {}) };
    }
  } catch (e) { console.log("Erro ao carregar dados."); }
}

function saveData() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify({ pixKeys, mediatorQueue, botConfig })); } catch (e) { console.log("Erro ao salvar dados."); }
}

client.once('ready', async () => {
  console.log(`✅ NEXUS ONLINE: ${client.user.tag}`);
  loadData();
  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) {
    await guild.commands.set([
      { name: 'painel_aposta', description: 'Cria o painel de apostas.' },
      { name: 'fila_mediadores', description: 'Entra/Sai da fila de ADMs.', options: [{ name: 'acao', type: 3, description: 'entrar ou sair', required: true, choices: [{name:'Entrar',value:'entrar'},{name:'Sair',value:'sair'}]}] },
      { name: 'ver_fila_mediadores', description: 'Mostra a fila de ADMs.' },
      { name: 'pix_adm', description: 'Define PIX de um membro.', options: [{name:'membro',type:6,description:'O ADM',required:true},{name:'chave',type:3,description:'A chave',required:true}] },
      { name: 'config_bot', description: 'Configura o bot.', options: [{name:'cor',type:3,description:'Cor hex'},{name:'logo',type:3,description:'URL da logo'},{name:'desc',type:3,description:'Descrição'},{name:'taxa',type:10,description:'Taxa ADM'}] }
    ]);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'painel_aposta') {
      const row1 = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_modo').setPlaceholder('Modo').addOptions({label:'1x1',value:'1x1'},{label:'2x2',value:'2x2'},{label:'4x4',value:'4x4'}));
      const row2 = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_valor').setPlaceholder('Valor').addOptions({label:'R$0,50',value:'0.50'},{label:'R$1,00',value:'1.00'},{label:'R$5,00',value:'5.00'}));
      const row3 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('post_panel').setLabel('Postar').setStyle(ButtonStyle.Success));
      await interaction.reply({ content: 'Configure:', components: [row1, row2, row3], ephemeral: true });
      adminSelections.set(interaction.user.id, { modo: '1x1', valor: '0.50', tipo: 'Mobile' });
    }
    if (interaction.commandName === 'ver_fila_mediadores') {
      const embed = new EmbedBuilder().setTitle('👮 FILA DE MEDIADORES').setColor(botConfig.EMBED_COLOR).setThumbnail(botConfig.LOGO_URL)
        .setDescription(mediatorQueue.length > 0 ? mediatorQueue.map((m, i) => `**${i+1}º** - <@${m.id}>`).join('\n') : 'Fila vazia.');
      await interaction.reply({ embeds: [embed] });
    }
    // ... (outros comandos slash mantidos)
  }

  if (interaction.isStringSelectMenu()) {
    const sel = adminSelections.get(interaction.user.id);
    if (interaction.customId === 'sel_modo') sel.modo = interaction.values[0];
    if (interaction.customId === 'sel_valor') sel.valor = interaction.values[0];
    await interaction.update({ content: `Configurando: ${sel.modo} | R$${sel.valor}` });
  }

  if (interaction.isButton()) {
    const [action, ...args] = interaction.customId.split('_');

    if (action === 'post' && args[0] === 'panel') {
      const sel = adminSelections.get(interaction.user.id);
      const embed = new EmbedBuilder().setTitle('🔥 NEXUS APOSTAS 🔥').setColor(botConfig.EMBED_COLOR).setThumbnail(botConfig.LOGO_URL)
        .setDescription(botConfig.DESCRIPTION_TEXT).addFields({name:'Modo',value:sel.modo,inline:true},{name:'Valor',value:`R$${sel.valor}`,inline:true},{name:'Fila',value:'Ninguém'});
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`join_<LaTex>${sel.modo}_$</LaTex>{sel.valor}`).setLabel('Entrar').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('leave').setLabel('Sair').setStyle(ButtonStyle.Danger)
      );
      await interaction.channel.send({ embeds: [embed], components: [row] });
      await interaction.update({ content: 'Postado!', components: [] });
    }

    if (action === 'join') {
      if (playerQueue.find(p => p.id === interaction.user.id)) return interaction.reply({ content: 'Já está na fila!', ephemeral: true });
      playerQueue.push({ id: interaction.user.id, user: interaction.user, modo: args[0], valor: args[1] });
      
      // Atualiza a Embed com o @
      const embed = EmbedBuilder.from(interaction.message.embeds[0]);
      embed.spliceFields(2, 1, { name: 'Fila', value: playerQueue.map(p => `<@${p.id}>`).join(', ') });
      await interaction.update({ embeds: [embed] });

      if (playerQueue.length >= 2) {
        const p1 = playerQueue.shift(); const p2 = playerQueue.shift();
        const med = mediatorQueue.shift(); if(med) mediatorQueue.push(med); saveData();
        const channel = await interaction.guild.channels.create({
          name: `💸-${p1.modo}-<LaTex>${p1.user.username}-vs-$</LaTex>{p2.user.username}`,
          permissionOverwrites: [{ id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }, { id: p1.id, allow: [PermissionsBitField.Flags.ViewChannel] }, { id: p2.id, allow: [PermissionsBitField.Flags.ViewChannel] }, ...(med ? [{ id: med.id, allow: [PermissionsBitField.Flags.ViewChannel] }] : [])]
        });
        activeBets.set(channel.id, { p1: p1.id, p2: p2.id, med: med?.id, valor: p1.valor, p1Conf: false, p2Conf: false });
        channel.send({ content: `<@<LaTex>${p1.id}> <@$</LaTex>{p2.id}> <LaTex>${med ? `<@$</LaTex>{med.id}>` : ''}`, embeds: [new EmbedBuilder().setTitle('PARTIDA CRIADA').setDescription('Confirmem para ver o PIX.').setColor(botConfig.EMBED_COLOR)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`conf_1_<LaTex>${channel.id}`).setLabel('Confirmar P1').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`conf_2_$</LaTex>{channel.id}`).setLabel('Confirmar P2').setStyle(ButtonStyle.Success))] });
      }
    }

    if (action === 'leave') {
      const idx = playerQueue.findIndex(p => p.id === interaction.user.id);
      if (idx !== -1) {
        playerQueue.splice(idx, 1);
        const embed = EmbedBuilder.from(interaction.message.embeds[0]);
        embed.spliceFields(2, 1, { name: 'Fila', value: playerQueue.length > 0 ? playerQueue.map(p => `<@${p.id}>`).join(', ') : 'Ninguém' });
        await interaction.update({ embeds: [embed] });
      } else {
        await interaction.reply({ content: 'Você não está na fila.', ephemeral: true });
      }
    }
    // ... (lógica de confirmação e cancelamento mantida)
  }
});

client.login(TOKEN);
