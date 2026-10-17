import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const mod = await (orig() as Promise<any>);
  return { ...mod, useNavigate: () => navigate };
});

vi.mock('../hooks/useTheatres', () => ({
  useTheatres: () => ({
    theatres: [{ id: 'caucasus', name: 'Caucasus' }, { id: 'nevada', name: 'Nevada' }],
    isLoading: false,
    error: null,
  }),
}));

const sel: any = {};
vi.mock('../contexts/PlanSelectionContext', () => ({
  usePlanSelection: () => sel,
}));

import PlansHomePage from './PlansHomePage';

const plan = (id: string, name: string, theatre = 'caucasus') => ({
  id, name, theatre, updatedAt: new Date().toISOString(), lastEditor: null,
});

beforeEach(() => {
  navigate.mockClear();
  Object.assign(sel, {
    plans: [plan('AAAAAAAAAAA1', 'Ingress Alpha'), plan('AAAAAAAAAAA2', 'Strike Batumi', 'nevada')],
    newDraft: vi.fn(() => 'AAAAAAAAAAA9'),
  });
});

describe('PlansHomePage', () => {
  it('lists the space plans with name and theatre', () => {
    render(<PlansHomePage />);
    expect(screen.getByText('Ingress Alpha')).toBeInTheDocument();
    expect(screen.getByText('Strike Batumi')).toBeInTheDocument();
    expect(screen.getByText(/Nevada/)).toBeInTheDocument();
  });

  it('selecting a plan opens its address', () => {
    render(<PlansHomePage />);
    fireEvent.click(screen.getByText('Ingress Alpha'));
    expect(navigate).toHaveBeenCalledWith('/p/AAAAAAAAAAA1/ingress-alpha');
  });

  it('offers no rename control', () => {
    render(<PlansHomePage />);
    expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument();
  });

  it('creating a plan makes a draft and opens its address', () => {
    render(<PlansHomePage />);
    fireEvent.click(screen.getByRole('button', { name: /new plan/i }));
    fireEvent.change(screen.getByPlaceholderText('Flight plan name'), { target: { value: 'Fresh Plan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(sel.newDraft).toHaveBeenCalledWith('caucasus', 'Fresh Plan');
    expect(navigate).toHaveBeenCalledWith('/p/AAAAAAAAAAA9/fresh-plan');
  });

  it('allows a New-plan name that another plan already uses', () => {
    render(<PlansHomePage />);
    fireEvent.click(screen.getByRole('button', { name: /new plan/i }));
    fireEvent.change(screen.getByPlaceholderText('Flight plan name'), { target: { value: 'Ingress Alpha' } });
    expect(screen.queryByText('Name must be unique.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
  });
});
