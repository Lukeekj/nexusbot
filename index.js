const { Client, GatewayIntentBits, Collection, ChannelType, PermissionsBitField, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
});

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

// --- Configurações do Bot (Persistentes) --- //
let botConfig = {
  LOGO_URL: "https://i.imgur.com/vH9X6N8.png", // URL padrão da logo
  EMBED_COLOR: "#FFD700", // Cor padrão das embeds (Amarelo/Dourado)
  DESCRIPTION_TEXT: "Clique no botão abaixo para entrar na fila e encontrar seu adversário!", // Descrição padrão
  TAXA_ADM: 0.25 // Taxa de ADM padrão
};

let pixKeys = {}; // { userId: 'chave_pix' }
let activeBets = new Collection(); // { channelId: { player1Id, player2Id, staffId, betAmount, gameMode, playerType, player1Confirmed, player2Confirmed } }
const playerQueue = []; // { userId, username, interaction, betDetails }
const mediatorQueue = []; // { userId, username }

// Armazenamento temporário das escolhas do ADM para o painel de aposta
const adminBetSelections = new Collection(); // { adminId: { gameMode, betValue, playerType } }

// --- Funções de Persistência --- //
const PIX_KEYS_FILE = path.join(__dirname, 'pixKeys.json');
const ACTIVE_BETS_FILE = path.join(__dirname, 'activeBets.json');
const MEDIATOR_QUEUE_FILE = path.join(__dirname, 'mediatorQueue.json');
const BOT_CONFIG_FILE = path.join(__dirname, 'botConfig.json');

function loadData() {
  try { pixKeys = JSON.parse(fs.readFileSync(PIX_KEYS_FILE, 'utf8')); } catch(e) { pixKeys = {}; }
  try { activeBets = new Collection(Object.entries(JSON.parse(fs.readFileSync(ACTIVE_BETS_FILE, 'utf8')))); } catch(e) { activeBets = new Collection(); }
  try { mediatorQueue.push(...JSON.parse(fs.readFileSync(MEDIATOR_QUEUE_FILE, 'utf8'))); } catch(e) { mediatorQueue.length = 0; }
  try { botConfig = { ...botConfig, ...JSON.parse(fs.readFileSync(BOT_CONFIG_FILE, 'utf8')) }; } catch(e) { /* Usa o padrão */ }
}

function saveData() {
  fs.writeFileSync(PIX_KEYS_FILE, JSON.stringify(pixKeys, null, 2));
  fs.writeFileSync(ACTIVE_BETS_FILE, JSON.stringify(Object.fromEntries(activeBets), null, 2));
  fs.writeFileSync(MEDIATOR_QUEUE_FILE, JSON.stringify(mediatorQueue, null, 2));
  fs.writeFileSync(BOT_CONFIG_FILE, JSON.stringify(botConfig, null, 2));
}

client.once('ready', async () => {
  console.log(`Bot NEXUS online como ${client.user.tag}`);
  loadData(); // Carrega os dados ao iniciar

  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) {
    await guild.commands.set([
      new SlashCommandBuilder()
        .setName('painel_aposta')
        .setDescription('Cria um painel configurável para iniciar apostas.')
        .toJSON(),
      new SlashCommandBuilder()
        .setName('setpix')
        .setDescription('Configura sua chave PIX de ADM.')
        .addStringOption(option =>
          option.setName('chave')
            .setDescription('Sua chave PIX')
            .setRequired(true))
        .toJSON(),
      new SlashCommandBuilder()
        .setName('pix_adm')
        .setDescription('Define a chave PIX para um membro específico.')
        .addUserOption(option =>
          option.setName('membro')
            .setDescription('O membro para quem você quer definir a chave PIX.')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('chave')
            .setDescription('A chave PIX do membro.')
            .setRequired(true))
        .toJSON(),
      new SlashCommandBuilder()
        .setName('fila_mediadores')
        .setDescription('Entra ou sai da fila de mediadores.')
        .addStringOption(option =>
          option.setName('acao')
            .setDescription('Entrar ou Sair da fila.')
            .setRequired(true)
            .addChoices(
              { name: 'Entrar', value: 'entrar' },
              { name: 'Sair', value: 'sair' }
            ))
        .toJSON(),
      new SlashCommandBuilder()
        .setName('ver_fila_mediadores')
        .setDescription('Mostra a fila atual de mediadores.')
        .toJSON(),
      new SlashCommandBuilder()
        .setName('config_bot')
        .setDescription('Configura a cor, logo e descrição das embeds do bot.')
        .addStringOption(option =>
          option.setName('cor')
            .setDescription('Cor hexadecimal para as embeds (ex: #FF0000).')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('logo_url')
            .setDescription('URL da imagem para a logo das embeds.')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('descricao')
            .setDescription('Nova descrição padrão para as embeds de aposta.')
            .setRequired(false))
        .addNumberOption(option =>
          option.setName('taxa_adm')
            .setDescription('Valor da taxa de ADM (ex: 0.25 para R$0,25).')
            .setRequired(false))
        .toJSON(),
    ]);
    console.log('Comandos registrados!');
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'painel_aposta') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: 'Você não tem permissão para usar este comando.', ephemeral: true });
      }
      const gameModeSelect = new StringSelectMenuBuilder()
        .setCustomId('select_game_mode')
        .setPlaceholder('Escolha o Modo de Jogo')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('2x2').setValue('2x2').setEmoji('⚔️'),
          new StringSelectMenuOptionBuilder().setLabel('3x3').setValue('3x3').setEmoji('🛡️'),
          new StringSelectMenuOptionBuilder().setLabel('4x4').setValue('4x4').setEmoji('💥'),
          new StringSelectMenuOptionBuilder().setLabel('1x1').setValue('1x1').setEmoji('🎯'),
        );

      const betValueSelect = new StringSelectMenuBuilder()
        .setCustomId('select_bet_value')
        .setPlaceholder('Escolha o Valor da Aposta')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('R$ 0,50').setValue('0.50').setEmoji('💰'),
          new StringSelectMenuOptionBuilder().setLabel('R<LaTex>$ 1,00').setValue('1.00').setEmoji('💰'),
          new StringSelectMenuOptionBuilder().setLabel('R$</LaTex> 2,00').setValue('2.00').setEmoji('💰'),
          new StringSelectMenuOptionBuilder().setLabel('R<LaTex>$ 3,00').setValue('3.00').setEmoji('💰'),
          new StringSelectMenuOptionBuilder().setLabel('R$</LaTex> 5,00').setValue('5.00').setEmoji('💰'),
          new StringSelectMenuOptionBuilder().setLabel('R<LaTex>$ 10,00').setValue('10.00').setEmoji('💰'),
          new StringSelectMenuOptionBuilder().setLabel('R$</LaTex> 20,00').setValue('20.00').setEmoji('💰'),
          new StringSelectMenuOptionBuilder().setLabel('R<LaTex>$ 50,00').setValue('50.00').setEmoji('💰'),
          new StringSelectMenuOptionBuilder().setLabel('R$</LaTex> 100,00').setValue('100.00').setEmoji('💰'),
        );

      const playerTypeSelect = new StringSelectMenuBuilder()
        .setCustomId('select_player_type')
        .setPlaceholder('Escolha o Tipo de Jogador')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('Mobile').setValue('mobile').setEmoji('📱'),
          new StringSelectMenuOptionBuilder().setLabel('Emulador').setValue('emulador').setEmoji('💻'),
          new StringSelectMenuOptionBuilder().setLabel('Tático').setValue('tatico').setEmoji('🧠'),
        );

      const row1 = new ActionRowBuilder().addComponents(gameModeSelect);
      const row2 = new ActionRowBuilder().addComponents(betValueSelect);
      const row3 = new ActionRowBuilder().addComponents(playerTypeSelect);

      const confirmButton = new ButtonBuilder()
        .setCustomId('confirm_panel_bet')
        .setLabel('Confirmar Aposta Pública')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅');

      const confirmRow = new ActionRowBuilder().addComponents(confirmButton);

      await interaction.reply({
        content: 'Configure a nova aposta pública:',
        components: [row1, row2, row3, confirmRow],
        ephemeral: true
      });

      // Inicializa as seleções do ADM
      adminBetSelections.set(interaction.user.id, { gameMode: null, betValue: null, playerType: null });
    }

    if (interaction.commandName === 'setpix') {
      pixKeys[interaction.user.id] = interaction.options.getString('chave');
      saveData();
      await interaction.reply({ content: `✅ **Sucesso!** Sua chave PIX foi configurada para: \`${pixKeys[interaction.user.id]}\``, ephemeral: true });
    }

    if (interaction.commandName === 'pix_adm') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: 'Você não tem permissão para usar este comando.', ephemeral: true });
      }
      const membro = interaction.options.getUser('membro');
      const chave = interaction.options.getString('chave');
      pixKeys[membro.id] = chave;
      saveData();
      await interaction.reply({ content: `✅ **Sucesso!** A chave PIX de <@${membro.id}> foi definida para: \`${chave}\``, ephemeral: true });
    }

    if (interaction.commandName === 'fila_mediadores') {
      const acao = interaction.options.getString('acao');
      const userIndex = mediatorQueue.findIndex(m => m.userId === interaction.user.id);

      if (acao === 'entrar') {
        if (userIndex !== -1) {
          return interaction.reply({ content: 'Você já está na fila de mediadores.', ephemeral: true });
        }
        mediatorQueue.push({ userId: interaction.user.id, username: interaction.user.username });
        saveData();
        await interaction.reply({ content: 'Você entrou na fila de mediadores!', ephemeral: true });
      } else if (acao === 'sair') {
        if (userIndex === -1) {
          return interaction.reply({ content: 'Você não está na fila de mediadores.', ephemeral: true });
        }
        mediatorQueue.splice(userIndex, 1);
        saveData();
        await interaction.reply({ content: 'Você saiu da fila de mediadores.', ephemeral: true });
      }
    }

    if (interaction.commandName === 'ver_fila_mediadores') {
      const embedFilaMediadores = new EmbedBuilder()
        .setTitle('👮 FILA DE MEDIADORES NEXUS APOSTAS 👮')
        .setThumbnail(botConfig.LOGO_URL)
        .setColor(botConfig.EMBED_COLOR)
        .setFooter({ text: 'Os mediadores são adicionados automaticamente às partidas.' });

      if (mediatorQueue.length === 0) {
        embedFilaMediadores.setDescription('Nenhum mediador na fila no momento.');
      } else {
        const filaText = mediatorQueue.map((m, index) => `**${index + 1}º:** <@${m.userId}>`).join('\n');
        embedFilaMediadores.setDescription(filaText);
      }
      await interaction.reply({ embeds: [embedFilaMediadores], ephemeral: false });
    }

    if (interaction.commandName === 'config_bot') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: 'Você não tem permissão para usar este comando.', ephemeral: true });
      }
      const newColor = interaction.options.getString('cor');
      const newLogoUrl = interaction.options.getString('logo_url');
      const newDescription = interaction.options.getString('descricao');
      const newTaxaAdm = interaction.options.getNumber('taxa_adm');

      if (newColor) botConfig.EMBED_COLOR = newColor;
      if (newLogoUrl) botConfig.LOGO_URL = newLogoUrl;
      if (newDescription) botConfig.DESCRIPTION_TEXT = newDescription;
      if (newTaxaAdm !== null) botConfig.TAXA_ADM = newTaxaAdm;
      saveData();

      await interaction.reply({ content: '✅ **Sucesso!** Configurações do bot atualizadas.', ephemeral: true });
    }
  }

  if (interaction.isStringSelectMenu()) {
    const adminId = interaction.user.id;
    const currentSelections = adminBetSelections.get(adminId) || {};

    if (interaction.customId === 'select_game_mode') {
      currentSelections.gameMode = interaction.values[0];
    } else if (interaction.customId === 'select_bet_value') {
      currentSelections.betValue = interaction.values[0];
    } else if (interaction.customId === 'select_player_type') {
      currentSelections.playerType = interaction.values[0];
    }
    adminBetSelections.set(adminId, currentSelections);

    await interaction.update({
      content: `Configure a nova aposta pública:\nModo: ${currentSelections.gameMode || 'Não selecionado'}\nValor: R<LaTex>$ $</LaTex>{currentSelections.betValue || 'Não selecionado'}\nTipo: ${currentSelections.playerType || 'Não selecionado'}`, 
      components: interaction.message.components // Mantém os componentes originais
    });
  }

  if (interaction.isButton()) {
    const [action, ...args] = interaction.customId.split('_');

    if (action === 'confirm' && args[0] === 'panel') {
      const adminId = interaction.user.id;
      const selections = adminBetSelections.get(adminId);

      if (!selections || !selections.gameMode || !selections.betValue || !selections.playerType) {
        return interaction.reply({ content: 'Por favor, selecione todas as opções antes de confirmar.', ephemeral: true });
      }

      const publicEmbed = new EmbedBuilder()
        .setTitle('🔥 NEXUS APOSTAS - PARTIDA ABERTA! 🔥')
        .setThumbnail(botConfig.LOGO_URL)
        .setDescription(botConfig.DESCRIPTION_TEXT)
        .addFields(
          { name: '🎮 Modo de Jogo', value: selections.gameMode, inline: true },
          { name: '💰 Valor da Aposta', value: `R$ ${parseFloat(selections.betValue).toFixed(2)}`, inline: true },
          { name: '📱 Tipo de Jogador', value: selections.playerType, inline: true }
        )
        .setColor(botConfig.EMBED_COLOR) // Amarelo/Dourado para destaque
        .setFooter({ text: 'NEXUS APOSTAS - A emoção do Free Fire!' });

      const joinQueueButton = new ButtonBuilder()
        .setCustomId(`join_queue_${selections.gameMode}_<LaTex>${selections.betValue}_$</LaTex>{selections.playerType}`)
        .setLabel('Entrar na Fila')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('➡️');
      
      const leaveQueueButton = new ButtonBuilder()
        .setCustomId('leave_queue')
        .setLabel('Sair da Fila')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('↩️');

      const publicRow = new ActionRowBuilder().addComponents(joinQueueButton, leaveQueueButton);

      await interaction.channel.send({ embeds: [publicEmbed], components: [publicRow] });
      await interaction.update({ content: 'Painel de aposta pública criado com sucesso!', components: [] });
      adminBetSelections.delete(adminId); // Limpa as seleções do ADM

    } else if (action === 'join' && args[0] === 'queue') {
      const [gameMode, betValue, playerType] = args;
      const betDetails = { gameMode, betValue, playerType };

      if (playerQueue.some(p => p.userId === interaction.user.id)) {
        return interaction.reply({ content: '❌ Você já está na fila de apostas para esta configuração.', ephemeral: true });
      }

      playerQueue.push({ userId: interaction.user.id, username: interaction.user.username, interaction, betDetails });
      
      const embedFila = new EmbedBuilder()
        .setTitle('🎮 FILA NEXUS APOSTAS')
        .setDescription(`**<@<LaTex>${interaction.user.id}>**, você entrou na fila!\n\n**Aguardando:** $</LaTex>{playerQueue.length}/2 jogadores para <LaTex>${gameMode} - R$</LaTex> ${betValue}.`)
        .setColor(botConfig.EMBED_COLOR);
        
      await interaction.reply({ embeds: [embedFila], ephemeral: true });

      if (playerQueue.length >= 2) {
        const p1 = playerQueue.shift();
        const p2 = playerQueue.shift();
        
        if (p1 && p2) {
          await createBetChannel(p1, p2, p1.betDetails); // Usa os detalhes da aposta do primeiro jogador
        }
      }

    } else if (action === 'leave' && args[0] === 'queue') {
      const userIndex = playerQueue.findIndex(p => p.userId === interaction.user.id);
      if (userIndex === -1) {
        return interaction.reply({ content: 'Você não está na fila de apostas.', ephemeral: true });
      }
      playerQueue.splice(userIndex, 1);
      await interaction.reply({ content: 'Você saiu da fila de apostas.', ephemeral: true });

    } else if (action === 'player' && args[0] === 'confirm') {
      const betId = args[1];
      const playerNum = args[2]; // '1' ou '2'
      const bet = activeBets.get(betId);

      if (!bet) return interaction.reply({ content: 'A aposta não foi encontrada.', ephemeral: true });

      if (playerNum === '1' && interaction.user.id === bet.player1Id) {
        bet.player1Confirmed = true;
      } else if (playerNum === '2' && interaction.user.id === bet.player2Id) {
        bet.player2Confirmed = true;
      } else {
        return interaction.reply({ content: 'Você não é um dos jogadores desta aposta.', ephemeral: true });
      }
      saveData();

      const confirmationMessage = `✅ <@${interaction.user.id}> confirmou a aposta!`;
      await interaction.reply({ content: confirmationMessage, ephemeral: true });

      if (bet.player1Confirmed && bet.player2Confirmed) {
        // Ambos confirmaram, agora mostra o PIX
        const staffPix = pixKeys[bet.staffId];
        if (!staffPix) return interaction.channel.send({ content: '❌ Este ADM ainda não configurou o PIX dele!' });
        
        const totalAmount = (parseFloat(bet.betAmount) + botConfig.TAXA_ADM).toFixed(2);
        const qr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(staffPix)}`;
        
        const embedPix = new EmbedBuilder()
          .setTitle('💵 PAGAMENTO DA APOSTA')
          .setThumbnail(botConfig.LOGO_URL)
          .setDescription('Escaneie o QR Code abaixo ou copie a chave PIX para realizar o pagamento.')
          .addFields(
            { name: '🔑 Chave PIX', value: `\`${staffPix}\`` },
            { name: '💰 Valor a Pagar', value: `R<LaTex>$ $</LaTex>{totalAmount}` },
            { name: '👤 ADM Responsável', value: `<@${bet.staffId}>` }
          )
          .setImage(qr)
          .setColor(botConfig.EMBED_COLOR)
          .setFooter({ text: 'Após o pagamento, envie o comprovante aqui no chat.' });

        await interaction.channel.send({ embeds: [embedPix], components: [] });
      }

    } else if (action === 'reject' && args[0] === 'bet') {
      const betId = args[1];
      activeBets.delete(betId);
      saveData();
      await interaction.channel.send('❌ Partida cancelada. O canal será excluído em 5 segundos...');
      setTimeout(() => interaction.channel.delete(), 5000);
    }
  }
});

client.login(TOKEN);

// --- Funções de Ajuda --- //
async function getNextMediator() {
  if (mediatorQueue.length === 0) return null;
  const mediator = mediatorQueue.shift(); // Pega o primeiro da fila
  mediatorQueue.push(mediator); // Coloca no final da fila
  saveData();
  return mediator;
}

async function createBetChannel(player1, player2, betDetails) {
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return;

  let betCategory = guild.channels.cache.find(
    (channel) => channel.name === 'NEXUS APOSTAS - PARTIDAS' && channel.type === ChannelType.GuildCategory
  );

  if (!betCategory) {
    betCategory = await guild.channels.create({
      name: 'NEXUS APOSTAS - PARTIDAS',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      ],
    });
  }

  const nextMediator = await getNextMediator();
  let mediatorMention = '';
  if (nextMediator) {
    mediatorMention = `<@${nextMediator.userId}>`;
  }

  const newChannel = await guild.channels.create({
    name: `💸-<LaTex>${betDetails.gameMode}-$</LaTex>{player1.username}-${player2.username}`,
    type: ChannelType.GuildText,
    parent: betCategory.id,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: player1.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: player2.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      ...(nextMediator ? [{ id: nextMediator.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : []),
    ],
  });

  const betId = newChannel.id;
  activeBets.set(betId, { 
    channelId: betId, 
    player1Id: player1.userId, 
    player2Id: player2.userId, 
    staffId: nextMediator ? nextMediator.userId : null, 
    betAmount: parseFloat(betDetails.betValue), 
    gameMode: betDetails.gameMode, 
    playerType: betDetails.playerType,
    player1Confirmed: false,
    player2Confirmed: false
  });
  saveData();

  const embedPartida = new EmbedBuilder()
    .setTitle('🚀 NOVA PARTIDA ENCONTRADA')
    .setThumbnail(botConfig.LOGO_URL)
    .addFields(
      { name: '👤 Jogador 1', value: `<@${player1.userId}>`, inline: true },
      { name: '👤 Jogador 2', value: `<@<LaTex>${player2.userId}>`, inline: true },
      { name: '🎮 Modo de Jogo', value: betDetails.gameMode, inline: true },
      { name: '💰 Valor da Aposta', value: `R$</LaTex> ${parseFloat(betDetails.betValue).toFixed(2)}`, inline: true },
      { name: '📱 Tipo de Jogador', value: betDetails.playerType, inline: true },
      ...(nextMediator ? [{ name: '👮 Mediador', value: mediatorMention, inline: true }] : []),
    )
    .setDescription(`**Aguardando a confirmação dos jogadores para prosseguir com o pagamento.**`)
    .setColor(botConfig.EMBED_COLOR)
    .setFooter({ text: 'NEXUS APOSTAS - O melhor sistema de Free Fire' });

  const confirmPlayer1Button = new ButtonBuilder()
    .setCustomId(`player_confirm_1_${betId}`)
    .setLabel(`Confirmar Aposta (<LaTex>${player1.username})`)
    .setStyle(ButtonStyle.Success)
    .setEmoji('✅');

  const confirmPlayer2Button = new ButtonBuilder()
    .setCustomId(`player_confirm_2_$</LaTex>{betId}`)
    .setLabel(`Confirmar Aposta (<LaTex>${player2.username})`)
    .setStyle(ButtonStyle.Success)
    .setEmoji('✅');

  const rejectBetButton = new ButtonBuilder()
    .setCustomId(`reject_bet_$</LaTex>{betId}`)
    .setLabel('Cancelar Partida')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('❌');

  const row = new ActionRowBuilder().addComponents(confirmPlayer1Button, confirmPlayer2Button, rejectBetButton);

  await newChannel.send({ content: `<@<LaTex>${player1.userId}> <@$</LaTex>{player2.userId}> <LaTex>${mediatorMention}`, embeds: [embedPartida], components: [row] });

  // Informa os jogadores que a partida foi criada
  await player1.interaction.followUp({ content: `Sua partida foi criada em $</LaTex>{newChannel.toString()}`, ephemeral: true });
  await player2.interaction.followUp({ content: `Sua partida foi criada em ${newChannel.toString()}`, ephemeral: true });
}

