const { 
    Client, GatewayIntentBits, Collection, ChannelType, 
    PermissionsBitField, ButtonBuilder, ButtonStyle, 
    ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, 
    SlashCommandBuilder 
} = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Servidor HTTP para manter o Replit Online 24/7
const http = require('http');
http.createServer((req, res) => { 
    res.write('NEXUS APOSTAS - SISTEMA ONLINE'); 
    res.end(); 
}).listen(8080);

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

// Configurações Padrão
let botConfig = {
    LOGO_URL: "https://i.imgur.com/vH9X6N8.png",
    EMBED_COLOR: "#FFD700",
    DESCRIPTION_TEXT: "🔥 Bem-vindo ao NEXUS APOSTAS! Escolha seu modo e entre na disputa. A emoção do Free Fire começa aqui!",
    TAXA_ADM: 0.25
};

let pixKeys = {};
let activeBets = new Collection();
let playerQueue = []; 
let mediatorQueue = [];
const adminSelections = new Collection();

const DATA_FILE = './nexus_database.json';

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
        fs.writeFileSync(DATA_FILE, JSON.stringify({ pixKeys, mediatorQueue, botConfig }, null, 4));
    } catch (e) { console.log("Erro ao salvar banco de dados."); }
}

client.once('ready', async () => {
    console.log(`🚀 NEXUS APOSTAS ONLINE: ${client.user.tag}`);
    loadData();
    const guild = client.guilds.cache.get(GUILD_ID);
    if (guild) {
        await guild.commands.set([
            new SlashCommandBuilder().setName('painel_aposta').setDescription('Abre o menu de configuração de nova aposta.').toJSON(),
            new SlashCommandBuilder().setName('setpix').setDescription('Configura sua chave PIX pessoal.').addStringOption(o => o.setName('chave').setDescription('Sua chave PIX').setRequired(true)).toJSON(),
            new SlashCommandBuilder().setName('pix_adm').setDescription('Define a chave PIX de um membro (ADM).').addUserOption(o => o.setName('membro').setDescription('Selecione o ADM').setRequired(true)).addStringOption(o => o.setName('chave').setDescription('Chave PIX').setRequired(true)).toJSON(),
            new SlashCommandBuilder().setName('fila_mediadores').setDescription('Entra ou sai da fila de mediadores.').addStringOption(o => o.setName('acao').setDescription('Escolha a ação').setRequired(true).addChoices({name:'Entrar na Fila',value:'entrar'},{name:'Sair da Fila',value:'sair'})).toJSON(),
            new SlashCommandBuilder().setName('ver_fila_mediadores').setDescription('Exibe a fila atual de mediadores ranqueada.').toJSON(),
            new SlashCommandBuilder().setName('config_bot').setDescription('Personaliza o visual das Embeds do bot.').addStringOption(o => o.setName('cor').setDescription('Cor Hexadecimal (Ex: #00FF00)')).addStringOption(o => o.setName('logo').setDescription('Link da URL da Logo')).addStringOption(o => o.setName('desc').setDescription('Texto da descrição')).addNumberOption(o => o.setName('taxa').setDescription('Valor da taxa ADM')).toJSON(),
        ]);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'painel_aposta') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '❌ Apenas administradores podem usar este comando.', ephemeral: true });
            const row1 = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_modo').setPlaceholder('🎮 Selecione o Modo de Jogo').addOptions({label:'X1 (1vs1)', value:'1x1', emoji:'👤'},{label:'2x2', value:'2x2', emoji:'👥'},{label:'3x3', value:'3x3', emoji:'🥉'},{label:'4x4', value:'4x4', emoji:'🏅'}));
            const row2 = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_valor').setPlaceholder('💰 Selecione o Valor da Aposta').addOptions({label:'R$ 0,50', value:'0.50'}, {label:'R<LaTex>$ 1,00', value:'1.00'}, {label:'R$</LaTex> 2,00', value:'2.00'}, {label:'R<LaTex>$ 5,00', value:'5.00'}, {label:'R$</LaTex> 10,00', value:'10.00'}, {label:'R<LaTex>$ 20,00', value:'20.00'}, {label:'R$</LaTex> 50,00', value:'50.00'}, {label:'R$ 100,00', value:'100.00'}));
            const row3 = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_tipo').setPlaceholder('📱 Selecione o Tipo de Jogador').addOptions({label:'Mobile', value:'Mobile', emoji:'📱'},{label:'Emulador', value:'Emulador', emoji:'💻'},{label:'Tático', value:'Tático', emoji:'🎯'}));
            const row4 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('confirm_panel_post').setLabel('Postar Aposta no Canal').setStyle(ButtonStyle.Success).setEmoji('🚀'));
            adminSelections.set(interaction.user.id, { modo: '1x1', valor: '0.50', tipo: 'Mobile' });
            await interaction.reply({ content: '🛠️ **Painel de Configuração NEXUS:**', components: [row1, row2, row3, row4], ephemeral: true });
        }

        if (interaction.commandName === 'ver_fila_mediadores') {
            const embed = new EmbedBuilder().setTitle('👮 FILA DE MEDIADORES - NEXUS').setColor(botConfig.EMBED_COLOR).setThumbnail(botConfig.LOGO_URL).setTimestamp();
            const list = mediatorQueue.length > 0 ? mediatorQueue.map((m, i) => `**${i+1}º Lugar** | <@<LaTex>${m.id}>`).join('\n') : '*A fila está vazia no momento.*';
            embed.setDescription(`Confira abaixo a ordem dos mediadores:\n\n$</LaTex>{list}`);
            await interaction.reply({ embeds: [embed] });
        }

        if (interaction.commandName === 'setpix') {
            pixKeys[interaction.user.id] = interaction.options.getString('chave');
            saveData();
            await interaction.reply({ content: `✅ Sua chave PIX foi salva: \`${pixKeys[interaction.user.id]}\``, ephemeral: true });
        }

        if (interaction.commandName === 'pix_adm') {
            const user = interaction.options.getUser('membro');
            pixKeys[user.id] = interaction.options.getString('chave');
            saveData();
            await interaction.reply({ content: `✅ Chave PIX de <@${user.id}> atualizada!`, ephemeral: true });
        }

        if (interaction.commandName === 'fila_mediadores') {
            const acao = interaction.options.getString('acao');
            if (acao === 'entrar') {
                if (mediatorQueue.find(m => m.id === interaction.user.id)) return interaction.reply({ content: '❌ Já está na fila!', ephemeral: true });
                mediatorQueue.push({ id: interaction.user.id, name: interaction.user.username });
            } else {
                const idx = mediatorQueue.findIndex(m => m.id === interaction.user.id);
                if (idx !== -1) mediatorQueue.splice(idx, 1);
            }
            saveData();
            await interaction.reply({ content: `✅ Fila de mediadores atualizada!`, ephemeral: true });
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
            await interaction.reply({ content: '✅ Configurações atualizadas!', ephemeral: true });
        }
    }

    if (interaction.isStringSelectMenu()) {
        const sel = adminSelections.get(interaction.user.id);
        if (!sel) return;
        if (interaction.customId === 'sel_modo') sel.modo = interaction.values[0];
        if (interaction.customId === 'sel_valor') sel.valor = interaction.values[0];
        if (interaction.customId === 'sel_tipo') sel.tipo = interaction.values[0];
        await interaction.update({ content: `🛠️ **Configurando:** Modo: \`<LaTex>${sel.modo}\` | Valor: \`R$</LaTex> <LaTex>${sel.valor}\` | Tipo: \`$</LaTex>{sel.tipo}\`` });
    }

    if (interaction.isButton()) {
        const [action, ...args] = interaction.customId.split('_');

        if (action === 'confirm' && args[0] === 'panel') {
            const sel = adminSelections.get(interaction.user.id);
            const embed = new EmbedBuilder().setTitle('🔥 NEXUS APOSTAS - NOVA PARTIDA 🔥').setColor(botConfig.EMBED_COLOR).setThumbnail(botConfig.LOGO_URL).setDescription(botConfig.DESCRIPTION_TEXT)
                .addFields({ name: '🎮 Modo', value: `\`<LaTex>${sel.modo}\``, inline: true }, { name: '💰 Valor', value: `\`R$</LaTex> <LaTex>${sel.valor}\``, inline: true }, { name: '📱 Tipo', value: `\`$</LaTex>{sel.tipo}\``, inline: true }, { name: '👥 Fila de Jogadores', value: '*Ninguém na fila ainda...*', inline: false })
                .setFooter({ text: 'Clique nos botões abaixo para participar!' });
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`join_<LaTex>${sel.modo}_$</LaTex>{sel.valor}_${sel.tipo}`).setLabel('Entrar na Fila').setStyle(ButtonStyle.Primary).setEmoji('➡️'), new ButtonBuilder().setCustomId('leave_player_queue').setLabel('Sair da Fila').setStyle(ButtonStyle.Danger).setEmoji('👋'));
            await interaction.channel.send({ embeds: [embed], components: [row] });
            await interaction.update({ content: '✅ Aposta publicada!', components: [] });
        }

        if (action === 'join') {
            if (playerQueue.find(p => p.id === interaction.user.id)) return interaction.reply({ content: '❌ Já está na fila!', ephemeral: true });
            playerQueue.push({ id: interaction.user.id, user: interaction.user, modo: args[0], valor: args[1], tipo: args[2] });
            const embed = EmbedBuilder.from(interaction.message.embeds[0]);
            embed.spliceFields(3, 1, { name: '👥 Fila de Jogadores', value: playerQueue.map(p => `<@${p.id}>`).join(', '), inline: false });
            await interaction.update({ embeds: [embed] });

            if (playerQueue.length >= 2) {
                const p1 = playerQueue.shift(); const p2 = playerQueue.shift();
                const med = mediatorQueue.shift(); if (med) mediatorQueue.push(med); saveData();
                const channel = await interaction.guild.channels.create({
                    name: `💸-<LaTex>${p1.modo}-$</LaTex>{p1.user.username}-vs-${p2.user.username}`,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [{ id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }, { id: p1.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }, { id: p2.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }, ...(med ? [{ id: med.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : [])]
                });
                const betId = channel.id;
                activeBets.set(betId, { p1: p1.id, p2: p2.id, med: med?.id, valor: p1.valor, p1Conf: false, p2Conf: false });
                const embedMatch = new EmbedBuilder().setTitle('🚀 PARTIDA ENCONTRADA!').setColor(botConfig.EMBED_COLOR).setThumbnail(botConfig.LOGO_URL).addFields({ name: '👤 Jogador 1', value: `<@${p1.id}>`, inline: true }, { name: '👤 Jogador 2', value: `<@<LaTex>${p2.id}>`, inline: true }, { name: '👮 Mediador', value: med ? `<@$</LaTex>{med.id}>` : '*Nenhum ADM disponível*', inline: true }).setDescription('**Ambos os jogadores devem confirmar para liberar o PIX.**');
                const rowMatch = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`conf_p1_<LaTex>${betId}`).setLabel(`Confirmar ($</LaTex>{p1.user.username})`).setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`conf_p2_<LaTex>${betId}`).setLabel(`Confirmar ($</LaTex>{p2.user.username})`).setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`cancel_match_<LaTex>${betId}`).setLabel('Cancelar').setStyle(ButtonStyle.Danger));
                await channel.send({ content: `<@$</LaTex>{p1.id}> <@<LaTex>${p2.id}> $</LaTex>{med ? `<@${med.id}>` : ''}`, embeds: [embedMatch], components: [rowMatch] });
                const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
                originalEmbed.spliceFields(3, 1, { name: '👥 Fila de Jogadores', value: '*Ninguém na fila ainda...*', inline: false });
                await interaction.message.edit({ embeds: [originalEmbed] });
            }
        }

        if (action === 'leave' && args[0] === 'player') {
            const idx = playerQueue.findIndex(p => p.id === interaction.user.id);
            if (idx !== -1) {
                playerQueue.splice(idx, 1);
                const embed = EmbedBuilder.from(interaction.message.embeds[0]);
                embed.spliceFields(3, 1, { name: '👥 Fila de Jogadores', value: playerQueue.length > 0 ? playerQueue.map(p => `<@${p.id}>`).join(', ') : '*Ninguém na fila ainda...*', inline: false });
                await interaction.update({ embeds: [embed] });
            }
        }

        if (action === 'conf') {
            const bet = activeBets.get(args[2]);
            if (!bet) return;
            if (args[1] === 'p1' && interaction.user.id === bet.p1) bet.p1Conf = true;
            if (args[1] === 'p2' && interaction.user.id === bet.p2) bet.p2Conf = true;
            await interaction.reply({ content: '✅ Confirmado!', ephemeral: true });
            if (bet.p1Conf && bet.p2Conf) {
                const pix = pixKeys[bet.med] || 'Chave não configurada.';
                const valorBase = parseFloat(bet.valor);
                const total = (valorBase + botConfig.TAXA_ADM).toFixed(2).replace('.', ',');
                const qr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=<LaTex>${encodeURIComponent(pix)}`;
                const embedPix = new EmbedBuilder().setTitle('💵 PAGAMENTO').setColor('#00FF00').setThumbnail(botConfig.LOGO_URL).setDescription(`Realize o pagamento para o mediador.`).addFields({ name: '🔑 Chave PIX', value: `\`$</LaTex>{pix}\`` }, { name: '💰 Valor Total', value: `R<LaTex>$ $</LaTex>{total} (Aposta: R<LaTex>$ $</LaTex>{valorBase.toFixed(2).replace('.', ',')} + Taxa: R<LaTex>$ $</LaTex>{botConfig.TAXA_ADM.toFixed(2).replace('.', ',')})` }).setImage(qr);
                await interaction.channel.send({ embeds: [embedPix] });
            }
        }

        if (action === 'cancel' && args[0] === 'match') {
            await interaction.channel.send('❌ Partida cancelada.');
            setTimeout(() => interaction.channel.delete(), 5000);
        }
    }
});

client.login(TOKEN);
