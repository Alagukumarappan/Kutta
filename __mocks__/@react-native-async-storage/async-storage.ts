const mockStorage: Record<string, string> = {};

export default {
  getItem: jest.fn((key: string) => Promise.resolve(mockStorage[key] ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStorage[key] = value;
    return Promise.resolve();
  }),
  clear: jest.fn(async () => {
    Object.keys(mockStorage).forEach(key => {
      delete mockStorage[key];
    });
  }),
};
