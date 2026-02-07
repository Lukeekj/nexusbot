const { 
    Client, GatewayIntentBits, Collection, ChannelType, 
    PermissionsBitField, ButtonBuilder, ButtonStyle, 
    ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, 
    SlashCommandBuilder 
} = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const http = require('http');
http.createServer((req, res) => { res.write('NEXUS ONLINE'); res.end(); }).listen(8080);

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
});

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

let botConfig = {
    LOGO_URL: "https://i.imgur.com/vH9X6N8.png",
    EMBED_COLOR: "#FFD700",
    DESCRIPTION_TEXT: "🔥 Bem-vindo ao NEXUS APOSTAS! Escolha seu modo e entre na disputa.",
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
    } catch (e) { console.log("Erro ao carregar"); }
}

function saveData() {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify({ pixKeys, mediatorQueue, botConfig }, null, 4)); } catch (e) { console.log("Erro ao salvar"); }
}

client.once('ready', async () => {
    console.log(`🚀 NEXUS ONLINE: ${client.user.tag}`);
    loadData();
    const guild = client.guilds.cache.get(GUILD_ID);
    if (guild) {
        await guild.commands.set([
            new SlashCommandBuilder().setName('painel_aposta').setDescription('Abre o menu de aposta.').toJSON(),
            new SlashCommandBuilder().setName('setpix').setDescription('Configura seu PIX.').addStringOption(o => o.setName('chave').setDescription('Sua chave').setRequired(true)).toJSON(),
            new SlashCommandBuilder().setName('pix_adm').setDescription('Define PIX de um membro.').addUserOption(o => o.setName('membro').setDescription('Selecione o ADM').setRequired(true)).addStringOption(o => o.setName('chave').setDescription('Chave').setRequired(true)).toJSON(),
            new SlashCommandBuilder().setName('fila_mediadores').setDescription('Entra/Sai da fila de ADMs.').addStringOption(o => o.setName('acao').setDescription('Ação').setRequired(true).addChoices({name:'Entrar',value:'entrar'},{name:'Sair',value:'sair'})).toJSON(),
            new SlashCommandBuilder().setName('ver_fila_mediadores').setDescription('Exibe a fila de ADMs.').toJSON(),
            new SlashCommandBuilder().setName('config_bot').setDescription('Personaliza o bot.').addStringOption(o => o.setName('cor').setDescription('Cor Hex')).addStringOption(o => o.setName('logo').setDescription('Link da Logo')).addStringOption(o => o.setName('desc').setDescription('Descrição')).addNumberOption(o => o.setName('taxa').setDescription('Taxa ADM')).toJSON(),
        ]);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'painel_aposta') {
            const row1 = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_modo').setPlaceholder('🎮 Modo de Jogo').addOptions({label:'1x1', value:'1x1'},{label:'2x2', value:'2x2'},{label:'4x4', value:'4x4'}));
            const row2 = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_valor').setPlaceholder('💰 Valor da Aposta').addOptions({label:'R$ 0,50', value:'0.50'}, {label:'R<LaTex>$ 1,00', value:'1.00'}, {label:'R$</LaTex> 5,00', value:'5.00'}, {label:'R$ 10,00', value:'10.00'}));
            const row3 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('confirm_panel_post').setLabel('Postar Aposta').setStyle(ButtonStyle.Success));
            adminSelections.set(interaction.user.id, { modo: '1x1', valor: '0.50', tipo: 'Mobile' });
            await interaction.reply({ content: '🛠️ Configuração:', components: [row1, row2, row3], ephemeral: true });
        }
        if (interaction.commandName === 'ver_fila_mediadores') {
            const list = mediatorQueue.length > 0 ? mediatorQueue.map((m, i) => `**${i+1}º** | <@${m.id}>`).join('\n') : '*Fila vazia.*';
            await interaction.reply({ embeds: [new EmbedBuilder().setTitle('👮 FILA DE ADMS').setDescription(list).setColor(botConfig.EMBED_COLOR).setThumbnail(botConfig.LOGO_URL)] });
        }
        if (interaction.commandName === 'setpix') { pixKeys[interaction.user.id] = interaction.options.getString('chave'); saveData(); await interaction.reply({ content: '✅ PIX salvo!', ephemeral: true }); }
        if (interaction.commandName === 'pix_adm') { const user = interaction.options.getUser('membro'); pixKeys[user.id] = interaction.options.getString('chave'); saveData(); await interaction.reply({ content: '✅ PIX do ADM salvo!', ephemeral: true }); }
        if (interaction.commandName === 'fila_mediadores') {
            const acao = interaction.options.getString('acao');
            if (acao === 'entrar') { if (!mediatorQueue.find(m => m.id === interaction.user.id)) mediatorQueue.push({ id: interaction.user.id }); }
            else { const idx = mediatorQueue.findIndex(m => m.id === interaction.user.id); if (idx !== -1) mediatorQueue.splice(idx, 1); }
            saveData(); await interaction.reply({ content: '✅ Fila atualizada!', ephemeral: true });
        }
        if (interaction.commandName === 'config_bot') {
            const cor = interaction.options.getString('cor'); const logo = interaction.options.getString('logo'); const desc = interaction.options.getString('desc'); const taxa = interaction.options.getNumber('taxa');
            if (cor) botConfig.EMBED_COLOR = cor; if (logo) botConfig.LOGO_URL = logo; if (desc) botConfig.DESCRIPTION_TEXT = desc; if (taxa !== null) botConfig.TAXA_ADM = taxa;
            saveData(); await interaction.reply({ content: '✅ Configurações salvas!', ephemeral: true });
        }
    }

    if (interaction.isStringSelectMenu()) {
        const sel = adminSelections.get(interaction.user.id);
        if (interaction.customId === 'sel_modo') sel.modo = interaction.values[0];
        if (interaction.customId === 'sel_valor') sel.valor = interaction.values[0];
        await interaction.update({ content: `🛠️ **Configurando:** ${sel.modo} | R<LaTex>$ $</LaTex>{sel.valor}` });
    }

    if (interaction.isButton()) {
        const [action, ...args] = interaction.customId.split('_');

        if (action === 'confirm' && args[0] === 'panel') {
            const sel = adminSelections.get(interaction.user.id);
            const embed = new EmbedBuilder().setTitle('🔥 NOVA APOSTA 🔥').setColor(botConfig.EMBED_COLOR).setThumbnail(botConfig.LOGO_URL).setDescription(botConfig.DESCRIPTION_TEXT)
                .addFields({ name: '🎮 Modo', value: `\`<LaTex>${sel.modo}\``, inline: true }, { name: '💰 Valor', value: `\`R$</LaTex> <LaTex>${sel.valor}\``, inline: true }, { name: '👥 Fila', value: '*Vazia*', inline: false });
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`join_$</LaTex>{sel.modo}_${sel.valor}`).setLabel('Entrar').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('leave').setLabel('Sair').setStyle(ButtonStyle.Danger));
            await interaction.channel.send({ embeds: [embed], components: [row] });
            await interaction.update({ content: '✅ Postado!', components: [] });
        }

        if (action === 'join') {
            if (playerQueue.find(p => p.id === interaction.user.id)) return interaction.reply({ content: '❌ Já está na fila!', ephemeral: true });
            playerQueue.push({ id: interaction.user.id, user: interaction.user, modo: args[0], valor: args[1] });
            const embed = EmbedBuilder.from(interaction.message.embeds[0]);
            embed.spliceFields(2, 1, { name: '👥 Fila', value: playerQueue.map(p => `<@${p.id}>`).join(', '), inline: false });
            await interaction.update({ embeds: [embed] });

            if (playerQueue.length >= 2) {
                const p1 = playerQueue.shift(); const p2 = playerQueue.shift();
                const med = mediatorQueue.shift(); if (med) mediatorQueue.push(med); saveData();
                const channel = await interaction.guild.channels.create({
                    name: `💸-<LaTex>${p1.modo}-$</LaTex>{p1.user.username}-vs-${p2.user.username}`,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [{ id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }, { id: p1.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }, { id: p2.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }, ...(med ? [{ id: med.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : [])]
                });
                activeBets.set(channel.id, { p1: p1.id, p2: p2.id, med: med?.id, valor: p1.valor, confirmed: [] });
                const embedMatch = new EmbedBuilder().setTitle('🚀 PARTIDA ENCONTRADA').setColor(botConfig.EMBED_COLOR).setThumbnail(botConfig.LOGO_URL).addFields({ name: '👤 Jogador 1', value: `<@${p1.id}>`, inline: true }, { name: '👤 Jogador 2', value: `<@<LaTex>${p2.id}>`, inline: true }, { name: '👮 ADM', value: med ? `<@$</LaTex>{med.id}>` : '*Nenhum*', inline: true }).setDescription('**Ambos os jogadores devem confirmar.**');
                const rowMatch = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`conf_bet_<LaTex>${channel.id}`).setLabel('Confirmar Aposta (0/2)').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`cancel_bet_$</LaTex>{channel.id}`).setLabel('Cancelar').setStyle(ButtonStyle.Danger));
                await channel.send({ content: `<@<LaTex>${p1.id}> <@$</LaTex>{p2.id}> <LaTex>${med ? `<@$</LaTex>{med.id}>` : ''}`, embeds: [embedMatch], components: [rowMatch] });
            }
        }

        if (action === 'leave') {
            const idx = playerQueue.findIndex(p => p.id === interaction.user.id);
            if (idx !== -1) {
                playerQueue.splice(idx, 1);
                const embed = EmbedBuilder.from(interaction.message.embeds[0]);
                embed.spliceFields(2, 1, { name: '👥 Fila', value: playerQueue.length > 0 ? playerQueue.map(p => `<@${p.id}>`).join(', ') : '*Vazia*', inline: false });
                await interaction.update({ embeds: [embed] });
            }
        }

        if (action === 'conf' && args[0] === 'bet') {
            const bet = activeBets.get(args[1]);
            if (!bet || (interaction.user.id !== bet.p1 && interaction.user.id !== bet.p2)) return interaction.reply({ content: 'Você não faz parte desta aposta.', ephemeral: true });
            if (bet.confirmed.includes(interaction.user.id)) return interaction.reply({ content: 'Você já confirmou!', ephemeral: true });
            
            bet.confirmed.push(interaction.user.id);
            
            if (bet.confirmed.length < 2) {
                const row = ActionRowBuilder.from(interaction.message.components[0]);
                row.components[0].setLabel(`Confirmar Aposta (1/2)`);
                await interaction.update({ components: [row] });
            } else {
                const pix = pixKeys[bet.med] || 'Chave não configurada.';
                const total = (parseFloat(bet.valor) + botConfig.TAXA_ADM).toFixed(2).replace('.', ',');
                const qr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pix)}`;
                const embedPix = new EmbedBuilder().setTitle('💵 PAGAMENTO').setColor('#00FF00').setThumbnail(botConfig.LOGO_URL).addFields({ name: '🔑 Chave PIX', value: `\`<LaTex>${pix}\`` }, { name: '💰 Valor', value: `R$</LaTex> ${total}` }).setImage(qr);
                await interaction.update({ content: '✅ Aposta Confirmada!', components: [], embeds: [interaction.message.embeds[0]] });
                await interaction.channel.send({ embeds: [embedPix] });
            }
        }

        if (action === 'cancel' && args[0] === 'bet') {
            await interaction.reply('❌ Cancelando...');
            setTimeout(() => interaction.channel.delete(), 3000);
        }
    }
});

client.login(TOKEN);
