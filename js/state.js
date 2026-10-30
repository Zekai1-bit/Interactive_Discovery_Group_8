const GameState = {
  STORAGE_KEY: 'curiousCase',

  defaults() {
    return {
      scene: 'entry',
      visited: [],
      collected: {},
      chosenPath: null,
      log: [],
      revealed: []
    };
  },

  current: null,

  save() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.current));
    } catch (err) {

    }
  },

  load() {
    this.current = this.defaults();
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {

        this.current = Object.assign(this.defaults(), JSON.parse(saved));
      }
    } catch (err) {
      this.current = this.defaults();
    }
    return this.current;
  },

  isReturning() {
    return this.current.visited.length > 0;
  },

  update(key, value) {
    this.current[key] = value;
    this.save();
  },

  visit(sceneId) {
    this.current.scene = sceneId;
    if (!this.current.visited.includes(sceneId)) this.current.visited.push(sceneId);
    this.save();
  },

  setPath(path) {
    this.update('chosenPath', path);
  },

  reveal(objectId) {
    if (!this.current.revealed.includes(objectId)) {
      this.current.revealed.push(objectId);
      this.save();
    }
  },

  isRevealed(objectId) {
    return this.current.revealed.includes(objectId);
  },

  collect(itemId, description) {
    if (this.current.collected[itemId]) return false;
    this.current.collected[itemId] = true;
    if (description) this.current.log.push(description);
    this.save();
    return true;
  },

  hasCollected(itemId) {
    return Boolean(this.current.collected[itemId]);
  },

  reset() {
    this.current = this.defaults();
    this.save();
  }
};
