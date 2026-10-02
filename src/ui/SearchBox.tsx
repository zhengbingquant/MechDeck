import { useId, useMemo, useRef, useState } from 'react';
import { searchParts } from '../lib/search';
import { useApp } from '../state/store';
import { useMech } from './useMech';

export function SearchBox() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const focusPart = useApp((s) => s.focusPart);
  const mech = useMech();

  const results = useMemo(() => searchParts(query, mech.parts, mech.systems, 8), [query, mech]);
  const showList = open && query.trim().length > 0;

  const choose = (id: string) => {
    focusPart(id);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="search" role="search">
      <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        id="part-search"
        type="search"
        inputMode="search"
        autoComplete="off"
        spellCheck={false}
        placeholder={`Search ${mech.designation} parts: turbine, canopy…`}
        aria-label="Search parts"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `${listId}-${results[active].id}` : undefined}
        data-testid="search-input"
        value={query}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            choose(results[active].id);
          } else if (e.key === 'Escape') {
            setQuery('');
            setOpen(false);
            e.currentTarget.blur();
          }
        }}
      />
      {showList && (
        <ul className="results" id={listId} role="listbox" data-testid="search-results">
          {results.length === 0 && <li className="empty muted">No matching parts</li>}
          {results.map((p, i) => {
            const sys = mech.systems.find((s) => s.id === p.system);
            return (
              <li
                key={p.id}
                id={`${listId}-${p.id}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'active' : undefined}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(p.id)}
              >
                <span className="swatch" style={{ background: sys?.color ?? '#dfe3ea' }} aria-hidden="true" />
                <span className="r-name">{p.name}</span>
                <span className="r-cat muted">{p.group === 'internal' ? p.category : 'Exterior'}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
