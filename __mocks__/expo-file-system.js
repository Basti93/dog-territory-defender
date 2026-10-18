// Jest mock for expo-file-system (new File/Paths API): never touches disk.
class File {
  constructor(...parts) {
    this.uri = 'file:///mock/' + parts.map((p) => (p && p.uri) || String(p)).join('/');
  }
  create() {}
  write() {}
  async text() {
    return '';
  }
}

module.exports = { File, Paths: { cache: { uri: 'file:///mock/cache' }, document: { uri: 'file:///mock/document' } } };
