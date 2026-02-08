const { 
    Client, GatewayIntentBits, Collection, ChannelType, 
    PermissionsBitField, ButtonBuilder, ButtonStyle, 
    ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, 
    SlashCommandBuilder 
} = require("discord.js");
const fs = require("fs");
require("dotenv").config();

// Servidor para manter o Replit acordado 24/7
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

// Banco de Dados Simples
let botConfig = {
    LOGO_URL: "https://i.imgur.com/vH9X6N8.png",
    EMBED_COLOR: "#FFD700",
    DESCRIPTION_TEXT: "🔥 Bem-vindo ao NEXUS APOSTAS! Escolha seu modo e entre na disputa.",
    TAXA_ADM: 0.25
};
let pixKeys = {};
let playerQueue = []; 
let mediatorQueue = [];
let activeBets = new Collection();

const DATA_FILE = './nexus_database.json';
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            pixKeys = data.pixKeys || {};
            mediatorQueue = data.mediatorQueue || [];
            botConfig = { ...botConfig, ...(data.botConfig || {}) };
        }
    } catch (e) { console.log("Erro ao carregar dados"); }
}
function saveData() {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify({ pixKeys, mediatorQueue, botConfig }, null, 4)); } catch (e) { console.log("Erro ao salvar"); }
}

client.once('ready', async () => {
    console.log(`🚀 NEXUS APOSTAS ONLINE: ${client.user.tag}`);
    loadData();
    const guild = client.guilds.cache.get(GUILD_ID);
    if (guild) {
        await guild.commands.set([
            new SlashCommandBuilder().setName('painel_aposta').setDescription('Abre o menu de configuração de nova aposta.').toJSON(),
            new SlashCommandBuilder().setName('setpix').setDescription('Configura sua chave PIX pessoal.').addStringOption(o => o.setName('chave').setDescription('Sua chave PIX').setRequired(true)).toJSON(),
            new SlashCommandBuilder().setName('pix_adm').setDescription('Define a chave PIX de um membro.').addUserOption(o => o.setName('membro').setDescription('Selecione o ADM').setRequired(true)).addStringOption(o => o.setName('chave').setDescription('Chave PIX').setRequired(true)).toJSON(),
            new SlashCommandBuilder().setName('fila_mediadores').setDescription('Entra ou sai da fila de mediadores.').addStringOption(o => o.setName('acao').setDescription('Escolha a ação').setRequired(true).addChoices({name:'Entrar',value:'entrar'},{name:'Sair',value:'sair'})).toJSON(),
            new SlashCommandBuilder().setName('ver_fila_mediadores').setDescription('Exibe a fila atual de mediadores.').toJSON(),
            new SlashCommandBuilder().setName('config_bot').setDescription('Personaliza o visual do bot.').addStringOption(o => o.setName('cor').setDescription('Cor Hex')).addStringOption(o => o.setName('logo').setDescription('Link da Logo')).addStringOption(o => o.setName('desc').setDescription('Descrição')).addNumberOption(o => o.setName('taxa').setDescription('Taxa ADM')).toJSON(),
        ]);
    }
});

client.on('interactionCreate', async (interaction) => {
    // --- COMANDOS ---
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'painel_aposta') {
            const row1 = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_modo').setPlaceholder('🎮 Modo de Jogo').addOptions({label:'1x1', value:'1x1'},{label:'2x2', value:'2x2'},{label:'4x4', value:'4x4'}));
            const row2 = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_valor').setPlaceholder('💰 Valor da Aposta').addOptions({label:'R$ 0,50', value:'0.50'},{label:'R<LaTex>$ 1,00', value:'1.00'},{label:'R$</LaTex> 5,00', value:'5.00'},{label:'R$ 10,00', value:'10.00'}));
            const row3 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('post_bet').setLabel('Postar Aposta').setStyle(ButtonStyle.Success).setEmoji('🚀'));
            await interaction.reply({ content: '🛠️ **Configure a Aposta:**', components: [row1, row2, row3], ephemeral: true });
        }
        // ... (outros comandos mantidos de forma simplificada para estabilidade)
        if (interaction.commandName === 'setpix') { pixKeys[interaction.user.id] = interaction.options.getString('chave'); saveData(); await interaction.reply({ content: '✅ PIX Salvo!', ephemeral: true }); }
        if (interaction.commandName === 'ver_fila_mediadores') {
            const list = mediatorQueue.length > 0 ? mediatorQueue.map((m, i) => `**${i+1}º** | <@${m.id}>`).join('\n') : '*Fila vazia.*';
            await interaction.reply({ embeds: [new EmbedBuilder().setTitle('👮 FILA DE ADMS').setDescription(list).setColor(botConfig.EMBED_COLOR).setThumbnail(botConfig.LOGO_URL)] });
        }
        if (interaction.commandName === 'fila_mediadores') {
            const acao = interaction.options.getString('acao');
            if (acao === 'entrar') { if (!mediatorQueue.find(m => m.id === interaction.user.id)) mediatorQueue.push({ id: interaction.user.id }); }
            else { const idx = mediatorQueue.findIndex(m => m.id === interaction.user.id); if (idx !== -1) mediatorQueue.splice(idx, 1); }
            saveData(); await interaction.reply({ content: '✅ Fila de ADMs atualizada!', ephemeral: true });
        }
    }

    // --- INTERAÇÕES DE COMPONENTES ---
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    try {
        const [action, ...args] = interaction.customId.split('_');

        // Seleção de Menus (Painel)
        if (interaction.isStringSelectMenu()) {
            await interaction.deferUpdate(); // Evita o erro de interação falhou
            return; 
        }

        // BOTÃO: Postar Aposta
        if (action === 'post') {
            const embed = new EmbedBuilder()
                .setTitle('🔥 NEXUS APOSTAS - NOVA PARTIDA 🔥')
                .setColor(botConfig.EMBED_COLOR)
                .setThumbnail(botConfig.LOGO_URL)
                .setDescription(botConfig.DESCRIPTION_TEXT)
                .addFields({ name: '👥 Fila', value: '*Ninguém na fila ainda...*', inline: false });
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('join_queue').setLabel('Entrar na Fila').setStyle(ButtonStyle.Primary).setEmoji('➡️'),
                new ButtonBuilder().setCustomId('leave_queue').setLabel('Sair da Fila').setStyle(ButtonStyle.Danger).setEmoji('👋')
            );
            await interaction.channel.send({ embeds: [embed], components: [row] });
            await interaction.update({ content: '✅ Aposta publicada!', components: [] });
        }

        // BOTÃO: Entrar na Fila
        if (action === 'join') {
            if (playerQueue.find(p => p.id === interaction.user.id)) return interaction.reply({ content: '❌ Você já está na fila!', ephemeral: true });
            playerQueue.push({ id: interaction.user.id, user: interaction.user });
            
            const embed = EmbedBuilder.from(interaction.message.embeds[0]);
            embed.spliceFields(0, 1, { name: '👥 Fila', value: playerQueue.map(p => `<@${p.id}>`).join(', '), inline: false });
            await interaction.update({ embeds: [embed] });

            if (playerQueue.length >= 2) {
                const p1 = playerQueue.shift(); const p2 = playerQueue.shift();
                const med = mediatorQueue.shift(); if (med) mediatorQueue.push(med); saveData();
                
                const channel = await interaction.guild.channels.create({
                    name: `💸-<LaTex>${p1.user.username}-vs-$</LaTex>{p2.user.username}`,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                        { id: p1.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                        { id: p2.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                        ...(med ? [{ id: med.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : [])
                    ]
                });

                activeBets.set(channel.id, { p1: p1.id, p2: p2.id, med: med?.id, confirmed: [] });
                
                const embedMatch = new EmbedBuilder()
                    .setTitle('🚀 PARTIDA ENCONTRADA')
                    .setColor(botConfig.EMBED_COLOR)
                    .setThumbnail(botConfig.LOGO_URL)
                    .addFields(
                        { name: '👤 Jogador 1', value: `<@<LaTex>${p1.id}>`, inline: true },
                        { name: '👤 Jogador 2', value: `<@$</LaTex>{p2.id}>`, inline: true },
                        { name: '👮 ADM', value: med ? `<@<LaTex>${med.id}>` : '*Nenhum*', inline: true }
                    ).setDescription('**Clique no botão abaixo para confirmar a aposta.**');

                const rowMatch = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`confirm_match_$</LaTex>{channel.id}`).setLabel('Confirmar Aposta (0/2)').setStyle(ButtonStyle.Success).setEmoji('✅'),
                    new ButtonBuilder().setCustomId(`cancel_match_<LaTex>${channel.id}`).setLabel('Cancelar').setStyle(ButtonStyle.Danger).setEmoji('❌')
                );

                await channel.send({ content: `<@$</LaTex>{p1.id}> <@<LaTex>${p2.id}> $</LaTex>{med ? `<@${med.id}>` : ''}`, embeds: [embedMatch], components: [rowMatch] });
                
                // Limpa fila na embed original
                const cleanEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
                cleanEmbed.spliceFields(0, 1, { name: '👥 Fila', value: '*Ninguém na fila ainda...*', inline: false });
                await interaction.message.edit({ embeds: [cleanEmbed] });
            }
        }

        // BOTÃO: Sair da Fila
        if (action === 'leave') {
            const idx = playerQueue.findIndex(p => p.id === interaction.user.id);
            if (idx !== -1) {
                playerQueue.splice(idx, 1);
                const embed = EmbedBuilder.from(interaction.message.embeds[0]);
                embed.spliceFields(0, 1, { name: '👥 Fila', value: playerQueue.length > 0 ? playerQueue.map(p => `<@${p.id}>`).join(', ') : '*Ninguém na fila ainda...*', inline: false });
                await interaction.update({ embeds: [embed] });
            } else {
                await interaction.reply({ content: '❌ Você não está na fila!', ephemeral: true });
            }
        }

        // BOTÃO ÚNICO: Confirmar Partida (0/2)
        if (action === 'confirm' && args[0] === 'match') {
            const betId = args[1];
            const bet = activeBets.get(betId);
            if (!bet) return;

            if (interaction.user.id !== bet.p1 && interaction.user.id !== bet.p2) {
                return interaction.reply({ content: '❌ Você não faz parte desta partida!', ephemeral: true });
            }

            if (bet.confirmed.includes(interaction.user.id)) {
                return interaction.reply({ content: '⚠️ Você já confirmou!', ephemeral: true });
            }

            bet.confirmed.push(interaction.user.id);

            if (bet.confirmed.length === 1) {
                // Atualiza o botão para (1/2)
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`confirm_match_<LaTex>${betId}`).setLabel('Confirmar Aposta (1/2)').setStyle(ButtonStyle.Success).setEmoji('✅'),
                    new ButtonBuilder().setCustomId(`cancel_match_$</LaTex>{betId}`).setLabel('Cancelar').setStyle(ButtonStyle.Danger).setEmoji('❌')
                );
                await interaction.update({ components: [row] });
            } else if (bet.confirmed.length === 2) {
                // Ambos confirmaram! Mostra o PIX
                const pix = pixKeys[bet.med] || 'Chave não configurada pelo ADM.';
                const qr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pix)}`;
                
                const embedPix = new EmbedBuilder()
                    .setTitle('💵 PAGAMENTO LIBERADO')
                    .setColor('#00FF00')
                    .setThumbnail(botConfig.LOGO_URL)
                    .addFields(
                        { name: '🔑 Chave PIX', value: `\`${pix}\`` },
                        { name: '💰 Valor Total', value: `R$ 0,75 (Taxa de ADM incluída)` }
                    )
                    .setImage(qr)
                    .setFooter({ text: 'Envie o comprovante para o mediador.' });

                await interaction.update({ content: '✅ **Aposta Confirmada por ambos!**', components: [], embeds: [interaction.message.embeds[0]] });
                await interaction.channel.send({ embeds: [embedPix] });
            }
        }

        // BOTÃO: Cancelar Partida
        if (action === 'cancel' && args[0] === 'match') {
            await interaction.reply('❌ **Partida cancelada.** O canal será excluído...');
            setTimeout(() => interaction.channel.delete(), 3000);
        }

    } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Ocorreu um erro ao processar sua ação.', ephemeral: true });
        }
    }
});

client.login(TOKEN);
