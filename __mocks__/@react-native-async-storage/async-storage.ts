const mockStorage: Record<string, string> = {};

export default {
  getItem: jest.fn((key: string) => Promise.resolve(mockStorage[key] ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStorage[key] = value;
    return Promise.resolve();
  }),
  // Added for activityLog.ts's clearActivityLog (and matches profileStore's
  // own real clearProfile, which called this from day one but had never
  // actually been exercised against this shared mock — every existing test
  // that touches clearProfile mocks the whole profileStore module instead).
  removeItem: jest.fn((key: string) => {
    delete mockStorage[key];
    return Promise.resolve();
  }),
  clear: jest.fn(async () => {
    Object.keys(mockStorage).forEach(key => {
      delete mockStorage[key];
    });
  }),
};
