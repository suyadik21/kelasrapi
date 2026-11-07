describe('KelasRapi foundation', () => {
  it('uses local-first product defaults', () => {
    expect({ cloudRequired: false, primaryRole: 'teacher' }).toEqual({
      cloudRequired: false,
      primaryRole: 'teacher',
    });
  });
});
