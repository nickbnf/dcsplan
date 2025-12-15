import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import * as Separator from '@radix-ui/react-separator';
import { AboutContent } from './AboutContent';

export const About: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>About - DCSPlan</title>
        <meta
          name="description"
          content="DCSPlan is a tactical planner for DCS flight simulators. Generate detailed kneeboards for mission planning and navigation, especially for aircraft with limited onboard systems."
        />
        <link rel="canonical" href={`${window.location.origin}/about`} />
      </Helmet>
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <header className="mb-8">
              <h1 className="text-3xl font-aero-label text-gray-900 mb-4">
                About DCSPlan
              </h1>
              <Link
                to="/"
                className="text-sm text-gray-600 hover:text-gray-900 underline inline-flex items-center gap-1"
              >
                ← Back to Planner
              </Link>
            </header>

            <Separator.Root className="my-6 bg-gray-300 h-px" />

            <section className="space-y-6">
              <AboutContent showGettingStarted={false} />
            </section>
          </div>
        </div>
      </main>
    </>
  );
};
