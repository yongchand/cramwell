import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface CourseStats {
  average_gpa?: number;
  average_hours?: number;
  prof_ratings?: number;
  course_ratings?: number;
}

interface CourseStatsChartsProps {
  stats: CourseStats;
  className?: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

export function CourseStatsCharts({ stats, className = '' }: CourseStatsChartsProps) {
  console.log('CourseStatsCharts received stats:', stats)
  
  // Create bar chart data for all statistics
  const allStatsData = [
    {
      name: 'Avg GPA',
      value: stats.average_gpa || 0,
      max: 4.0,
      color: '#0088FE',
      displayValue: stats.average_gpa ? `${stats.average_gpa.toFixed(2)}` : 'N/A'
    },
    {
      name: 'Avg Hours',
      value: stats.average_hours || 0,
      max: 20,
      color: '#00C49F',
      displayValue: stats.average_hours ? `${stats.average_hours.toFixed(1)}h` : 'N/A'
    },
    {
      name: 'Prof Rating',
      value: stats.prof_ratings || 0,
      max: 5,
      color: '#FFBB28',
      displayValue: stats.prof_ratings ? `${stats.prof_ratings.toFixed(1)}/5` : 'N/A'
    },
    {
      name: 'Course Rating',
      value: stats.course_ratings || 0,
      max: 5,
      color: '#FF8042',
      displayValue: stats.course_ratings ? `${stats.course_ratings.toFixed(1)}/5` : 'N/A'
    }
  ];

  // Filter out entries with no data
  const validData = allStatsData.filter(item => item.value > 0);

  if (validData.length === 0) {
    return (
      <div className={`flex items-center justify-center h-48 ${className}`}>
        <div className="text-center text-sm">
          <p>No statistics available</p>
          <p className="text-xs opacity-75 mt-1">Be the first to review!</p>
        </div>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 rounded shadow-lg">
          <p className="font-semibold text-gray-900 dark:text-white">{label}</p>
          <p className="text-sm text-gray-700 dark:text-gray-300">{data.displayValue}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`w-full space-y-4 ${className}`}>
      {/* Individual Stat Cards */}
      <div className="grid grid-cols-2 gap-4">
        {validData.map((stat, index) => (
          <div key={index} className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <h5 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{stat.name}</h5>
              <div className="text-2xl font-bold" style={{ color: stat.color }}>
                {stat.displayValue}
              </div>
              <div className="mt-2">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className="h-2 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${(stat.value / stat.max) * 100}%`,
                      backgroundColor: stat.color
                    }}
                  />
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {((stat.value / stat.max) * 100).toFixed(0)}% of max
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 