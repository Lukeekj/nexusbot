const { Client, GatewayIntentBits, Collection, ChannelType, PermissionsBitField, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

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
const playerQueue = [];
const mediatorQueue = [];
const adminBetSelections = new Collection();

// Funções simples de persistência
function loadData() {
  try { if(fs.existsSync('data.json')) { const data = JSON.parse(fs.readFileSync('data.json', 'utf8')); pixKeys = data.pixKeys || {}; botConfig = data.botConfig || botConfig; } } catch(e) { console.log("Erro ao carregar dados"); }
}
function saveData() {
  try { fs.writeFileSync('data.json', JSON.stringify({ pixKeys, botConfig })); } catch(e) { console.log("Erro ao salvar"); }
}

client.once('ready', async () => {
  console.log(`Bot NEXUS online como ${client.user.tag}`);
  loadData();
  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) {
    await guild.commands.set([
      { name: 'painel_aposta', description: 'Cria o painel de apostas.' },
      { name: 'fila_mediadores', description: 'Entra/Sai da fila de ADMs.', options: [{ name: 'acao', type: 3, description: 'entrar ou sair', required: true, choices: [{name:'Entrar',value:'entrar'},{name:'Sair',value:'sair'}]}] },
      { name: 'ver_fila_mediadores', description: 'Mostra a fila de ADMs.' },
      { name: 'pix_adm', description: 'Define PIX de um membro.', options: [{name:'membro',type:6,description:'O ADM',required:true},{name:'chave',type:3,description:'A chave',required:true}] },
      { name: 'config_bot', description: 'Configura o bot.', options: [{name:'cor',type:3,description:'Cor hex'},{name:'logo',type:3,description:'URL da logo'}] }
    ]);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'painel_aposta') {
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('sel_modo').setPlaceholder('Modo').addOptions({label:'1x1',value:'1x1'},{label:'2x2',value:'2x2'},{label:'4x4',value:'4x4'})
      );
      const row2 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('sel_valor').setPlaceholder('Valor').addOptions({label:'R$1',value:'1'},{label:'R$5',value:'5'},{label:'R$10',value:'10'})
      );
      const btn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_postar').setLabel('Postar Aposta').setStyle(ButtonStyle.Success));
      await interaction.reply({ content: 'Configure a aposta:', components: [row, row2, btn], ephemeral: true });
      adminBetSelections.set(interaction.user.id, { modo: '1x1', valor: '1' });
    }
    // ... (restante da lógica simplificada para evitar erros)
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith('join_')) {
      if (playerQueue.find(p => p.id === interaction.user.id)) return interaction.reply({ content: 'Já está na fila!', ephemeral: true });
      playerQueue.push({ id: interaction.user.id, user: interaction.user });
      await interaction.reply({ content: `Você entrou na fila! (${playerQueue.length}/2)`, ephemeral: true });
      if (playerQueue.length >= 2) {
        const p1 = playerQueue.shift(); const p2 = playerQueue.shift();
        const channel = await interaction.guild.channels.create({
          name: `aposta-<LaTex>${p1.user.username}-vs-$</LaTex>{p2.user.username}`,
          parent: interaction.channel.parentId,
          permissionOverwrites: [{ id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }, { id: p1.id, allow: [PermissionsBitField.Flags.ViewChannel] }, { id: p2.id, allow: [PermissionsBitField.Flags.ViewChannel] }]
        });
        const med = mediatorQueue[0] ? `<@<LaTex>${mediatorQueue[0].id}>` : 'Nenhum ADM na fila';
        channel.send({ content: `Partida Criada! Jogadores: <@$</LaTex>{p1.id}> vs <@<LaTex>${p2.id}>. Mediador: $</LaTex>{med}\nConfirmem a aposta para ver o PIX!` });
      }
    }
  }
});

client.login(TOKEN);
