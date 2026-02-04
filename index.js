const http = require('http');
const { Client, GatewayIntentBits, Collection, ChannelType, PermissionsBitField, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Servidor Web para o Render não desligar o bot
http.createServer((req, res) => { res.write('NEXUS ONLINE'); res.end(); }).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
});

const TOKEN = 
const GUILD_ID = 

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

const DATA_FILE = path.join(__dirname, 'database.json');

function loadData() {
  try { if (fs.existsSync(DATA_FILE)) { const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); pixKeys = data.pixKeys || {}; mediatorQueue.push(...(data.mediatorQueue || [])); botConfig = { ...botConfig, ...(data.botConfig || {}) }; } } catch(e) { console.log("Erro ao carregar"); }
}

function saveData() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify({ pixKeys, mediatorQueue, botConfig })); } catch(e) { console.log("Erro ao salvar"); }
}

client.once('ready', async () => {
  console.log(`Bot NEXUS online como ${client.user.tag}`);
  loadData();
  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) {
    await guild.commands.set([
      new SlashCommandBuilder().setName('painel_aposta').setDescription('Cria o painel configurável.').toJSON(),
      new SlashCommandBuilder().setName('setpix').setDescription('Configura seu PIX.').addStringOption(o => o.setName('chave').setDescription('Sua chave').setRequired(true)).toJSON(),
      new SlashCommandBuilder().setName('pix_adm').setDescription('Define PIX de um membro.').addUserOption(o => o.setName('membro').setDescription('O membro').setRequired(true)).addStringOption(o => o.setName('chave').setDescription('A chave').setRequired(true)).toJSON(),
      new SlashCommandBuilder().setName('fila_mediadores').setDescription('Entra/Sai da fila de ADMs.').addStringOption(o => o.setName('acao').setDescription('Ação').setRequired(true).addChoices({name:'Entrar',value:'entrar'},{name:'Sair',value:'sair'})).toJSON(),
      new SlashCommandBuilder().setName('ver_fila_mediadores').setDescription('Mostra a fila de ADMs.').toJSON(),
      new SlashCommandBuilder().setName('config_bot').setDescription('Configura o bot.').addStringOption(o => o.setName('cor').setDescription('Cor Hex')).addStringOption(o => o.setName('logo').setDescription('URL da logo')).addStringOption(o => o.setName('desc').setDescription('Descrição')).addNumberOption(o => o.setName('taxa').setDescription('Taxa ADM')).toJSON(),
    ]);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'painel_aposta') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
      const row1 = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_modo').setPlaceholder('Modo de Jogo').addOptions({label:'1x1',value:'1x1'},{label:'2x2',value:'2x2'},{label:'4x4',value:'4x4'}));
      const row2 = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_valor').setPlaceholder('Valor da Aposta').addOptions({label:'R$0,50',value:'0.50'},{label:'R$1,00',value:'1.00'},{label:'R$5,00',value:'5.00'},{label:'R$10,00',value:'10.00'}));
      const row3 = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_tipo').setPlaceholder('Tipo de Jogador').addOptions({label:'Mobile',value:'mobile'},{label:'Emulador',value:'emulador'},{label:'Tático',value:'tatico'}));
      const row4 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('confirm_panel').setLabel('Postar Aposta').setStyle(ButtonStyle.Success).setEmoji('✅'));
      await interaction.reply({ content: 'Configure a aposta:', components: [row1, row2, row3, row4], ephemeral: true });
      adminBetSelections.set(interaction.user.id, { modo: '1x1', valor: '0.50', tipo: 'mobile' });
    }

    if (interaction.commandName === 'setpix') {
      pixKeys[interaction.user.id] = interaction.options.getString('chave');
      saveData();
      await interaction.reply({ content: `✅ PIX configurado: \`${pixKeys[interaction.user.id]}\``, ephemeral: true });
    }

    if (interaction.commandName === 'pix_adm') {
      const membro = interaction.options.getUser('membro');
      pixKeys[membro.id] = interaction.options.getString('chave');
      saveData();
      await interaction.reply({ content: `✅ PIX de <@${membro.id}> configurado.`, ephemeral: true });
    }

    if (interaction.commandName === 'fila_mediadores') {
      const acao = interaction.options.getString('acao');
      if (acao === 'entrar') {
        if (mediatorQueue.find(m => m.id === interaction.user.id)) return interaction.reply({ content: 'Já está na fila.', ephemeral: true });
        mediatorQueue.push({ id: interaction.user.id, name: interaction.user.username });
      } else {
        const idx = mediatorQueue.findIndex(m => m.id === interaction.user.id);
        if (idx !== -1) mediatorQueue.splice(idx, 1);
      }
      saveData();
      await interaction.reply({ content: `Fila atualizada!`, ephemeral: true });
    }

    if (interaction.commandName === 'ver_fila_mediadores') {
      const embed = new EmbedBuilder().setTitle('👮 FILA DE MEDIADORES').setColor(botConfig.EMBED_COLOR).setThumbnail(botConfig.LOGO_URL);
      const text = mediatorQueue.length > 0 ? mediatorQueue.map((m, i) => `**${i+1}º** - <@${m.id}>`).join('\n') : 'Fila vazia.';
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
      await interaction.reply({ content: '✅ Configurações salvas!', ephemeral: true });
    }
  }

  if (interaction.isStringSelectMenu()) {
    const sel = adminBetSelections.get(interaction.user.id);
    if (interaction.customId === 'sel_modo') sel.modo = interaction.values[0];
    if (interaction.customId === 'sel_valor') sel.valor = interaction.values[0];
    if (interaction.customId === 'sel_tipo') sel.tipo = interaction.values[0];
    await interaction.update({ content: `Configurando: ${sel.modo} | R$${sel.valor} | ${sel.tipo}` });
  }

  if (interaction.isButton()) {
    const [action, ...args] = interaction.customId.split('_');
    
    if (action === 'confirm' && args[0] === 'panel') {
      const sel = adminBetSelections.get(interaction.user.id);
      const embed = new EmbedBuilder().setTitle('🔥 NEXUS APOSTAS - PARTIDA 🔥').setColor(botConfig.EMBED_COLOR).setThumbnail(botConfig.LOGO_URL).setDescription(botConfig.DESCRIPTION_TEXT)
        .addFields({name:'Modo',value:sel.modo,inline:true},{name:'Valor',value:`R$${sel.valor}`,inline:true},{name:'Tipo',value:sel.tipo,inline:true});
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`join_<LaTex>${sel.modo}_$</LaTex>{sel.valor}_${sel.tipo}`).setLabel('Entrar na Fila').setStyle(ButtonStyle.Primary).setEmoji('➡️'),
        new ButtonBuilder().setCustomId('leave_queue').setLabel('Sair').setStyle(ButtonStyle.Danger)
      );
      await interaction.channel.send({ embeds: [embed], components: [row] });
      await interaction.update({ content: 'Postado!', components: [] });
    }

    if (action === 'join') {
      if (playerQueue.find(p => p.id === interaction.user.id)) return interaction.reply({ content: 'Já está na fila!', ephemeral: true });
      playerQueue.push({ id: interaction.user.id, user: interaction.user, modo: args[0], valor: args[1], tipo: args[2] });
      await interaction.reply({ content: `Você entrou na fila! Aguardando oponente...`, ephemeral: true });
      
      if (playerQueue.length >= 2) {
        const p1 = playerQueue.shift(); const p2 = playerQueue.shift();
        const med = mediatorQueue.shift(); if(med) mediatorQueue.push(med); saveData();
        const guild = interaction.guild;
        const channel = await guild.channels.create({
          name: `💸-${p1.modo}-<LaTex>${p1.user.username}-vs-$</LaTex>{p2.user.username}`,
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
        
        const embedPartida = new EmbedBuilder().setTitle('🚀 PARTIDA ENCONTRADA').setColor(botConfig.EMBED_COLOR).setThumbnail(botConfig.LOGO_URL)
          .addFields({name:'Jogador 1',value:`<@<LaTex>${p1.id}>`,inline:true},{name:'Jogador 2',value:`<@$</LaTex>{p2.id}>`,inline:true},{name:'Mediador',value:med ? `<@<LaTex>${med.id}>` : 'Sem mediador',inline:true});
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`conf_1_$</LaTex>{betId}`).setLabel(`Confirmar (<LaTex>${p1.user.username})`).setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`conf_2_$</LaTex>{betId}`).setLabel(`Confirmar (<LaTex>${p2.user.username})`).setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`cancel_$</LaTex>{betId}`).setLabel('Cancelar').setStyle(ButtonStyle.Danger)
        );
        await channel.send({ content: `<@<LaTex>${p1.id}> <@$</LaTex>{p2.id}> <LaTex>${med ? `<@$</LaTex>{med.id}>` : ''}`, embeds: [embedPartida], components: [row] });
      }
    }

    if (action === 'leave') {
      const idx = playerQueue.findIndex(p => p.id === interaction.user.id);
      if (idx !== -1) playerQueue.splice(idx, 1);
      await interaction.reply({ content: 'Saiu da fila.', ephemeral: true });
    }

    if (action === 'conf') {
      const bet = activeBets.get(args[1]);
      if (args[0] === '1' && interaction.user.id === bet.p1) bet.p1Conf = true;
      if (args[0] === '2' && interaction.user.id === bet.p2) bet.p2Conf = true;
      await interaction.reply({ content: 'Você confirmou!', ephemeral: true });
      
      if (bet.p1Conf && bet.p2Conf) {
        const pix = pixKeys[bet.med] || 'Chave não configurada';
        const total = (parseFloat(bet.valor) + botConfig.TAXA_ADM).toFixed(2);
        const qr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=<LaTex>${encodeURIComponent(pix)}`;
        const embedPix = new EmbedBuilder().setTitle('💵 PAGAMENTO').setColor(botConfig.EMBED_COLOR).setThumbnail(botConfig.LOGO_URL)
          .setDescription(`Pague o PIX para o mediador:\n\n**Chave:** \`$</LaTex>{pix}\`\n**Valor:** R<LaTex>$ $</LaTex>{total}`)
          .setImage(qr);
        await interaction.channel.send({ embeds: [embedPix] });
      }
    }

    if (action === 'cancel') {
      await interaction.channel.send('❌ Cancelando...');
      setTimeout(() => interaction.channel.delete(), 3000);
    }
  }
});

client.login(TOKEN);
