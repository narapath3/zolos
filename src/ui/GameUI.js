import { getExpRequired, ITEMS, MONSTERS, PAYON_MONSTERS, WATER_MONSTERS, getAllMonsters, SHOP_ITEMS } from '../engine/GameData.js';
import { fetchLeaderboard, loadInventory, saveInventoryItem, updateInventoryItemStats, fetchMarketListings, listMarketItem, buyMarketItem, cancelMarketListing, fetchMarketPriceStats } from '../network/GameSync.js';


export class GameUI {
  constructor(character = null, soundManager = null) {
    this.gameScreen = document.getElementById('game-screen');
    this.combatLogEl = document.getElementById('combat-log-messages');
    this.maxLogMessages = 20;
    this.inventory = [];
    this.characterId = null;


    this.character = character;
    this.soundManager = soundManager;


    this.currentTab = 'all';
    this.selectedItemName = null;


    // Leaderboard category state
    this.leaderboardCategory = 'level';
    // Online panel view state
    this.onlineView = 'global';


    // P2P Market state
    this.marketTab = 'buy';
    this.selectedMarketItem = null;


    // Profile Editor callback
    this.profileSaveCallback = null;


    // Shop state
    this.currentShopTab = 'all';
    this.selectedShopItem = null;


    this._setupPanels();
    this._setupROInventoryEvents();
    this._setupShopEvents();
    this._setupMarketEvents();
    this._setupWiki();
    this._setupFriendSystem();
    this._setupChat();
    this._setupMinimap();
    this._setupProfileEditor();
    this._setupLeaderboardTabs();
    this._setupOnlineTabs();
  }


  show() {
    this.gameScreen.style.display = 'block';
  }


  hide() {
    this.gameScreen.style.display = 'none';
  }


  _setupPanels() {
    // Panel toggle buttons
    document.getElementById('btn-stats').addEventListener('click', () => this._togglePanel('stats-panel'));
    document.getElementById('btn-inventory').addEventListener('click', () => this._togglePanel('inventory-panel'));


    const btnMarket = document.getElementById('btn-market');
    if (btnMarket) {
      btnMarket.addEventListener('click', () => {
        this._togglePanel('market-panel');
        this._renderMarket();
      });
    }
    document.getElementById('btn-leaderboard').addEventListener('click', () => {
      this._togglePanel('leaderboard-panel');
      this._refreshLeaderboard();
