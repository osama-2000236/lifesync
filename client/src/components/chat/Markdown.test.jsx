import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Markdown from './Markdown';

const md = (text) => render(<Markdown text={text} />).container;

describe('Markdown', () => {
  it('renders nothing for empty text', () => {
    const { container } = render(<Markdown text="" />);
    expect(container).toBeEmptyDOMElement();
    const { container: c2 } = render(<Markdown text={null} />);
    expect(c2).toBeEmptyDOMElement();
  });

  it('renders a plain paragraph with preserved newlines', () => {
    const c = md('Hello there\nsecond line');
    const p = c.querySelector('p');
    expect(p).toHaveTextContent('Hello there');
    expect(p.className).toContain('whitespace-pre-wrap');
  });

  it('renders bold and inline code', () => {
    const c = md('Walk **5k steps** and log `water 2L` today');
    expect(c.querySelector('strong')).toHaveTextContent('5k steps');
    const code = c.querySelector('code');
    expect(code).toHaveTextContent('water 2L');
    expect(code).toHaveAttribute('dir', 'ltr');
  });

  it('swallows an unclosed bold marker mid-stream', () => {
    const c = md('Getting **bett');
    expect(c.textContent).toBe('Getting bett');
    expect(c.querySelector('strong')).toBeNull();
  });

  it('swallows an unclosed inline-code marker mid-stream', () => {
    const c = md('run `npm tes');
    expect(c.textContent).toBe('run npm tes');
    expect(c.querySelector('code')).toBeNull();
  });

  it('renders a closed code fence as a pre block', () => {
    const c = md('Before\n```\nconst a = 1;\nconst b = 2;\n```\nAfter');
    const pre = c.querySelector('pre');
    expect(pre).toHaveTextContent('const a = 1;');
    expect(pre).toHaveAttribute('dir', 'ltr');
    expect(c.textContent).toContain('After');
  });

  it('renders an open (still-streaming) fence immediately as code', () => {
    const c = md('```\nlet x = 1;');
    expect(c.querySelector('pre')).toHaveTextContent('let x = 1;');
  });

  it('renders unordered lists', () => {
    const c = md('- sleep more\n- spend less\n\ndone');
    const ul = c.querySelector('ul');
    expect(ul.querySelectorAll('li')).toHaveLength(2);
    expect(ul.className).toContain('list-disc');
  });

  it('renders ordered lists with inline formatting inside items', () => {
    const c = md('1. **first** thing\n2. second `thing`');
    const ol = c.querySelector('ol');
    expect(ol.querySelectorAll('li')).toHaveLength(2);
    expect(ol.querySelector('strong')).toHaveTextContent('first');
    expect(ol.querySelector('code')).toHaveTextContent('thing');
  });

  it('splits adjacent ordered and unordered runs into separate lists', () => {
    const c = md('- a\n1. b');
    expect(c.querySelector('ul')).not.toBeNull();
    expect(c.querySelector('ol')).not.toBeNull();
  });

  it('keeps the wrapper bidi-safe with dir=auto', () => {
    md('مرحبا **بالعالم**');
    expect(screen.getAllByTestId('markdown')[0]).toHaveAttribute('dir', 'auto');
  });

  it('handles text that is only a marker without crashing', () => {
    const c = md('**');
    expect(c.textContent).toBe('');
  });
});
