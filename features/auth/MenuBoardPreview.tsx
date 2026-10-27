const ORBS: Record<number, 'green' | 'red'> = {
  18: 'green',
  19: 'green',
  20: 'red',
  26: 'green',
  27: 'green',
  28: 'red',
  35: 'green',
  36: 'red',
  43: 'green',
};

/** Non-interactive 8×8 preview that occupies the same board area as a live match. */
export function MenuBoardPreview() {
  return (
    <div className="menu-board-preview" role="img" aria-label="Preview of an 8 by 8 Chain Reaction board">
      {Array.from({ length: 64 }, (_, index) => {
        const owner = ORBS[index];
        return (
          <span className={`menu-preview-cell ${owner ? `has-${owner}` : ''}`} key={index}>
            {owner && <i className="menu-preview-orb" />}
          </span>
        );
      })}
    </div>
  );
}
