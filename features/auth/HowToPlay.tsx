const thresholdExamples = [
  { name: 'Corner', count: 2, target: 0 },
  { name: 'Edge', count: 3, target: 1 },
  { name: 'Center', count: 4, target: 4 },
];

/** Visual, signed-out guide to the board rules. It does not interact with a live game. */
export function HowToPlay() {
  return (
    <section className="how-to-play" aria-labelledby="how-to-play-title">
      <span className="eyebrow-mini">THE RULES, AT A GLANCE</span>
      <h2 id="how-to-play-title">One spark can take the board.</h2>
      <p className="how-to-intro">
        Place an orb in an empty cell or one you control. Build to the cell’s limit and it bursts.
      </p>

      <div className="threshold-grid" aria-label="Orb burst limits by cell position">
        {thresholdExamples.map(({ name, count, target }) => (
          <article className="threshold-card" key={name}>
            <div className="threshold-board" aria-hidden="true">
              {Array.from({ length: 9 }, (_, index) => (
                <span className={index === target ? 'threshold-cell is-target' : 'threshold-cell'} key={index}>
                  {index === target && (
                    <span className="threshold-orbs">
                      {Array.from({ length: count }, (_, orb) => <i key={orb} />)}
                    </span>
                  )}
                </span>
              ))}
            </div>
            <div className="threshold-caption">
              <b>{name}</b>
              <span><i>{count}</i> to burst</span>
            </div>
          </article>
        ))}
      </div>

      <article className="rule-step reaction-step">
        <div className="rule-step-copy">
          <span className="rule-number">01</span>
          <div>
            <h3>Burst. Spread. Convert.</h3>
            <p>A burst sends one orb to each neighbor. Enemy cells caught in the chain become yours.</p>
          </div>
        </div>
        <div className="reaction-diagram" aria-label="A green burst spreads into neighboring cells">
          <span className="reaction-cell" />
          <span className="reaction-cell" />
          <span className="reaction-cell is-green"><i /></span>
          <span className="reaction-cell is-green"><i /></span>
          <span className="reaction-cell is-red"><i /></span>
          <span className="reaction-cell" />
          <span className="reaction-cell is-green"><i /></span>
          <span className="reaction-cell is-green"><i /><i /></span>
          <span className="reaction-cell is-green"><i /></span>
          <span className="reaction-cell" />
          <span className="reaction-cell" />
          <span className="reaction-cell is-green"><i /></span>
          <span className="reaction-cell is-green"><i /></span>
          <span className="reaction-cell is-red"><i /></span>
          <span className="reaction-cell" />
          <span className="reaction-arrow arrow-up">↑</span>
          <span className="reaction-arrow arrow-right">→</span>
          <span className="reaction-arrow arrow-down">↓</span>
          <span className="reaction-arrow arrow-left">←</span>
        </div>
      </article>

      <article className="rule-step win-step">
        <div className="rule-step-copy">
          <span className="rule-number">02</span>
          <div>
            <h3>Take every last cell.</h3>
            <p>Keep the chain moving until every opponent orb has changed to your color.</p>
          </div>
        </div>
        <div className="capture-visual" aria-hidden="true">
          <div className="capture-board before-board">
            <i /><i /><i className="red-orb" /><i />
            <i /><i className="red-orb" /><i className="red-orb" /><i />
            <i /><i /><i className="red-orb" /><i />
          </div>
          <span className="capture-arrow">→</span>
          <div className="capture-board after-board">
            {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
          </div>
          <span className="capture-label">ALL GREEN</span>
        </div>
      </article>

      <aside className="bot-callout">
        <span className="bot-mark" aria-hidden="true">✳</span>
        <div>
          <span className="eyebrow-mini">STRATEGY TRAINING</span>
          <h3>Overpowered bots. Sharper instincts.</h3>
          <p>Practice reading chains and planning your next move.</p>
        </div>
        <span className="coming-soon">COMING SOON</span>
      </aside>
    </section>
  );
}
