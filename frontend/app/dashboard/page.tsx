"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { UploadDialog } from "@/components/upload-dialog";
import { createClient } from "@/utils/supabase/client";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";
import { Search, BookOpen, Library, GraduationCap, Share2, LogOut, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Confetti from "react-confetti";
import AOS from "aos";
import "aos/dist/aos.css";
import { ShareDialog } from "@/components/share-dialog";
import { v4 as uuidv4 } from 'uuid';

interface Notebook {
  id: string;
  name: string;
  description: string;
  professor?: string;
  created_at: string;
  updated_at: string;
}

interface Summary {
  id: string;
  notebook_id: string;
  average_gpa?: number;
  average_hours?: number;
  prof_ratings?: number;
  course_ratings?: number;
}

export default function DashboardPage() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const COURSES_PER_PAGE = 8;
  const [myCourses, setMyCourses] = useState<Notebook[]>([]);
  const [myCoursesLoading, setMyCoursesLoading] = useState(true);
  const [enrolledIds, setEnrolledIds] = useState<string[]>([]);
  const [enrollLoadingId, setEnrollLoadingId] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());
  
  // Helper function to get summary data for a notebook
  const getSummaryForNotebook = (notebookId: string): Summary | undefined => {
    return summaries.find(summary => summary.notebook_id === notebookId);
  };
  
  // Toggle card flip
  const toggleCardFlip = (notebookId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFlippedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(notebookId)) {
        newSet.delete(notebookId);
      } else {
        newSet.add(notebookId);
      }
      return newSet;
    });
  };
  
  // Fetch all notebooks once for client-side search and pagination
  useEffect(() => {
    const fetchNotebooks = async () => {
      setLoading(true);
      const supabase = createClient();
      // Fetch all notebooks at once
      const { data, error } = await supabase
        .from("notebooks")
        .select("*")
        .order("name");
      if (!error && data) {
        setNotebooks(data);
        
        // Fetch summary data for all notebooks
        const notebookIds = data.map(nb => nb.id);
        if (notebookIds.length > 0) {
          const { data: summaryData, error: summaryError } = await supabase
            .from("summary")
            .select("*")
            .in("notebook_id", notebookIds);
          if (!summaryError && summaryData) {
            setSummaries(summaryData);
          }
        }
      }
      setLoading(false);
    };
    fetchNotebooks();
  }, []); // Only fetch once on component mount

  // Filter All Courses by search
  const filteredNotebooks = notebooks.filter(nb => {
    const searchLower = search.trim().toLowerCase();
    return (
      nb.name.toLowerCase().includes(searchLower) ||
      nb.description.toLowerCase().includes(searchLower) ||
      (nb.professor?.toLowerCase().includes(searchLower) ?? false)
    );
  });

  // Pagination for filtered results
  const totalPages = Math.ceil(filteredNotebooks.length / COURSES_PER_PAGE);
  const paginatedNotebooks = filteredNotebooks.slice(
    (currentPage - 1) * COURSES_PER_PAGE,
    currentPage * COURSES_PER_PAGE
  );
  // Filtered data for My Courses
  const filteredMyCourses = myCourses.filter(nb => enrolledIds.includes(nb.id));

  const router = useRouter();

  // Efficient: Fetch only user's enrolled notebooks for My Courses
  useEffect(() => {
    const fetchMyCourses = async () => {
      setMyCoursesLoading(true);
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        setMyCourses([]);
        setEnrolledIds([]);
        setMyCoursesLoading(false);
        return;
      }
      // Get all notebook_ids from user_notebooks for this user
      const { data: userNotebooks, error: userNotebooksError } = await supabase
        .from("user_notebooks")
        .select("notebook_id")
        .eq("user_id", userId)
        .eq("active", true);
      if (userNotebooksError || !userNotebooks) {
        setMyCourses([]);
        setEnrolledIds([]);
        setMyCoursesLoading(false);
        return;
      }
      const notebookIds = userNotebooks.map((un: any) => un.notebook_id);
      setEnrolledIds(notebookIds);
      if (notebookIds.length === 0) {
        setMyCourses([]);
        setMyCoursesLoading(false);
        return;
      }
      // Fetch only the notebooks the user is enrolled in
      const { data: myNotebooks, error: myNotebooksError } = await supabase
        .from("notebooks")
        .select("*")
        .in("id", notebookIds);
      if (!myNotebooksError && myNotebooks) {
        setMyCourses(myNotebooks);
      } else {
        setMyCourses([]);
      }
      setMyCoursesLoading(false);
    };
    fetchMyCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, []); // Keep empty dependency array for initial load

  const handleUpload = (files: FileList | File[]) => {
    // TODO: Implement actual upload logic
  };

  // Logout functionality
  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    AOS.init({ duration: 800, once: true });
  }, []);

  // Enroll/Disenroll logic
  const handleEnrollToggle = async (notebookId: string, isEnrolled: boolean) => {
    setEnrollLoadingId(notebookId);
    let prevEnrolledIds = [...enrolledIds];
    let prevMyCourses = [...myCourses];
    // Optimistically update UI
    if (isEnrolled) {
      setEnrolledIds(prev => prev.filter(id => id !== notebookId));
      setMyCourses(prev => prev.filter(nb => nb.id !== notebookId));
    } else {
      setEnrolledIds(prev => [...prev, notebookId]);
      setMyCourses(prev => {
        if (prev.some(nb => nb.id === notebookId)) return prev;
        const nb = notebooks.find(nb => nb.id === notebookId);
        return nb ? [...prev, nb] : prev;
      });
    }
    // Backend update
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("No user");
      if (isEnrolled) {
        await supabase
          .from("user_notebooks")
          .update({ active: false })
          .eq("user_id", userId)
          .eq("notebook_id", notebookId);
      } else {
        // Check if record exists first
        const { data: existingRows } = await supabase
          .from("user_notebooks")
          .select("id")
          .eq("user_id", userId)
          .eq("notebook_id", notebookId)
          .limit(1);
        
        if (existingRows && existingRows.length > 0) {
          // Update existing record
          await supabase
            .from("user_notebooks")
            .update({ active: true })
            .eq("user_id", userId)
            .eq("notebook_id", notebookId);
        } else {
          // Insert new record
          await supabase
            .from("user_notebooks")
            .insert({
              user_id: userId,
              notebook_id: notebookId,
              active: true,
              created_at: new Date().toISOString(),
            });
        }
      }
    } catch (err) {
      // Revert optimistic update on error
      setEnrolledIds(prevEnrolledIds);
      setMyCourses(prevMyCourses);
      alert("Failed to update enrollment. Please try again.");
    }
    setEnrollLoadingId(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Bar */}
      <header className="w-full flex items-center justify-between px-4 md:px-8 py-4 border-b border-muted" style={{backgroundColor: '#7C2529'}}>
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
          <img src="/logo-icon.svg" alt="Cramwell" className="h-8 w-8 flex-shrink-0" />
          <div className="text-xl md:text-2xl font-extrabold text-white tracking-tight truncate">Cramwell</div>
        </div>
        <div className="flex gap-2 md:gap-3 items-center flex-shrink-0">
          <Button
            variant="outline"
            className="rounded-full px-3 md:px-6 py-1 text-sm font-semibold border-white text-white hover:bg-white/10 hover:text-white bg-uchicago-crimson/80"
            onClick={() => setShareOpen(true)}
          >
            <Share2 className="w-4 h-4 md:mr-2" /> 
            <span className="hidden md:inline">Share</span>
          </Button>
          <Button
            variant="destructive"
            className="rounded-full px-3 md:px-6 py-1 text-sm font-semibold bg-white text-uchicago-crimson border-white hover:bg-white/80 hover:text-uchicago-crimson"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 md:mr-2" /> 
            <span className="hidden md:inline">Logout</span>
          </Button>
        </div>
      </header>
      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} url={typeof window !== 'undefined' ? window.location.href : ''} />

      {/* Hero Section */}
      <motion.section
        initial={{ opacity: 0, y: -40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full flex flex-col items-center justify-center py-8 px-4 mb-6 relative overflow-hidden"
        style={{ minHeight: 220 }}
      >
        {/* Blurred UChicago campus image background */}
        <img
          src="/uchicago-bg.jpg"
          alt="UChicago Campus"
          className="absolute inset-0 w-full h-full object-cover object-center z-0 blur-md scale-110 opacity-60"
          style={{ filter: "blur(16px) brightness(0.7)" }}
        />
        {/* Glassmorphism overlay */}
        <div className="absolute inset-0 bg-white/30 dark:bg-gray-900/40 backdrop-blur-md z-0" />
        <div className="relative z-10 flex flex-col items-center">
          <div className="flex items-center gap-1 md:gap-3 mb-2">
            <img 
              src="/mascot_chicago.png" 
              alt="Chicago Mascot" 
              className="w-16 h-16 md:w-20 md:h-20"
            />
            <h1 className="font-serif text-3xl md:text-6xl font-extrabold mb-3 text-left md:text-center drop-shadow-lg tracking-tight" style={{ fontFamily: 'Merriweather, serif' }}>
              UChicago Cramwell
            </h1>
          </div>
          <p className="text-lg md:text-xl mb-4 text-center font-medium opacity-90">Your Unfair Advantage to a Perfect GPA</p>
        </div>
      </motion.section>

      {/* Main Content */}
      <main className="flex flex-col items-center w-full flex-1 px-4 pb-16 bg-gradient-to-b from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
        {/* My Courses */}
        <section className="w-full max-w-7xl mx-auto mb-12">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-6 h-6 text-uchicago-crimson" />
            <h2 className="text-2xl font-bold">My Courses</h2>
          </div>
          {myCoursesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="relative rounded-2xl bg-gray-200/60 dark:bg-gray-800/60 shadow-lg border border-gray-100 dark:border-gray-800 flex flex-col justify-between min-h-[220px] p-6 animate-pulse"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-shrink-0 bg-gray-300 dark:bg-gray-700 rounded-full p-2 w-10 h-10" />
                    <div className="h-6 bg-gray-300 dark:bg-gray-700 rounded w-2/3" />
                  </div>
                  <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded mb-2 w-full" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded mb-4 w-5/6" />
                  <div className="flex items-center justify-between mt-auto pt-2">
                    <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/4" />
                    <div className="h-8 bg-gray-300 dark:bg-gray-700 rounded-full w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredMyCourses.length === 0 ? (
            <div className="h-12 flex items-center justify-center text-muted-foreground bg-muted/40 rounded-lg border border-dashed border-muted">
              You are not enrolled in any courses yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
              {filteredMyCourses.map((nb) => {
                const isEnrolled = enrolledIds.includes(nb.id);
                const summary = getSummaryForNotebook(nb.id);
                const isFlipped = flippedCards.has(nb.id);
                return (
                  <motion.div
                    key={nb.id}
                    data-aos="fade-up"
                    whileHover={{ scale: isEnrolled ? 1.08 : 1.02, boxShadow: isEnrolled ? "0 8px 32px 0 rgba(124,37,41,0.16)" : "0 4px 16px 0 rgba(0,0,0,0.1)" }}
                    whileTap={{ scale: isEnrolled ? 0.97 : 1 }}
                    className={`relative rounded-2xl bg-white dark:bg-gray-900 shadow-lg border border-gray-100 dark:border-gray-800 flex flex-col justify-between min-h-[220px] p-6 group overflow-hidden transition-transform duration-200 ${isEnrolled ? 'cursor-pointer' : 'cursor-default'}`}
                    onClick={isEnrolled ? () => router.push(`/notebook/${nb.id}`) : undefined}
                    tabIndex={isEnrolled ? 0 : -1}
                    role={isEnrolled ? "button" : "article"}
                    onKeyDown={isEnrolled ? (e: React.KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Enter' || e.key === ' ') router.push(`/notebook/${nb.id}`); } : undefined}
                    aria-label={isEnrolled ? `Open notebook ${nb.name}` : `Course ${nb.name} - not enrolled`}
                  >

                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex-shrink-0 bg-uchicago-crimson/10 rounded-full p-2">
                        <GraduationCap className="w-6 h-6 text-uchicago-crimson animate-bounce group-hover:animate-spin" />
                      </div>
                      <div className="font-bold text-lg truncate" title={nb.name}>{nb.name}</div>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold mb-2">
                      {nb.professor}
                    </div>
                    <div className="text-base text-gray-700 dark:text-gray-200 mb-4 whitespace-pre-line break-words font-medium leading-relaxed">
                      {nb.description}
                    </div>
                    <div className="flex items-center justify-between mt-auto pt-2">
                      <button
                        onClick={(e) => toggleCardFlip(nb.id, e)}
                        className="px-6 py-1 rounded-full bg-uchicago-crimson text-white text-sm font-semibold hover:bg-uchicago-crimson/90 transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 mr-2"
                        title="View course summary"
                      >
                        {isFlipped ? "Course Overview" : "Course Summary"}
                      </button>
                      <Button
                        variant={isEnrolled ? "destructive" : "outline"}
                        className={
                          isEnrolled
                            ? "rounded-full px-6 py-1 text-sm font-semibold shadow-none"
                            : "rounded-full px-6 py-1 text-sm font-semibold border-uchicago-crimson text-uchicago-crimson hover:bg-uchicago-crimson/10 shadow-none"
                        }
                        disabled={enrollLoadingId === nb.id}
                        onClick={e => {
                          e.stopPropagation();
                          if (!isEnrolled) {
                            setShowConfetti(true);
                            setTimeout(() => setShowConfetti(false), 2000);
                          }
                          handleEnrollToggle(nb.id, isEnrolled);
                        }}
                      >
                        {enrollLoadingId === nb.id ? (
                          <Loader2 className="animate-spin h-4 w-4 mr-2" />
                        ) : null}
                        {isEnrolled ? "Disenroll" : "Enroll"}
                      </Button>
                    </div>
                    
                    {/* Statistics overlay */}
                    {isFlipped && (
                      <div className="absolute inset-0 bg-uchicago-crimson text-white rounded-2xl flex flex-col justify-center items-center p-6 z-10">
                        <div className="text-center">
                          <h3 className="text-lg font-bold mb-4">{nb.name}</h3>
                          {summary ? (
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span>Avg Hours:</span>
                                <span className="font-semibold">{summary.average_hours?.toFixed(1) || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Course Rating:</span>
                                <span className="font-semibold">{summary.course_ratings?.toFixed(1) || 'N/A'}/5</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Prof Rating:</span>
                                <span className="font-semibold">{summary.prof_ratings?.toFixed(1) || 'N/A'}/5</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Avg GPA:</span>
                                <span className="font-semibold">{summary.average_gpa?.toFixed(2) || 'N/A'}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center text-sm">
                              <p>No statistics available</p>
                              <p className="text-xs opacity-75 mt-1">Be the first to review!</p>
                            </div>
                          )}
                          <button
                            onClick={(e) => toggleCardFlip(nb.id, e)}
                            className="mt-4 px-3 py-1.5 rounded-full bg-white text-uchicago-crimson text-xs font-semibold hover:bg-gray-100 transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
                            title="Back to course details"
                          >
                            Back to Course
                          </button>
                        </div>
                      </div>
                    )}
                    {/* Confetti burst */}
                    <AnimatePresence>
                      {showConfetti && (
                        <Confetti
                          width={900}
                          height={500}
                          recycle={false}
                          numberOfPieces={500}
                          gravity={0.3}
                          className="absolute left-0 top-0 z-30 pointer-events-none"
                        />
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>
        <div className="w-full max-w-7xl mx-auto border-t border-muted mb-12" />
        {/* All Courses */}
        <section className="w-full max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <Library className="w-6 h-6 text-uchicago-crimson" />
            <h2 className="text-2xl font-bold">All Courses</h2>
          </div>
          <div className="mb-8 flex justify-start">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
              <Input
                type="text"
                placeholder="Search courses..."
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10"
              />
            </div>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
              {Array.from({ length: COURSES_PER_PAGE }).map((_, i) => (
                <div
                  key={i}
                  className="relative rounded-2xl bg-gray-200/60 dark:bg-gray-800/60 shadow-lg border border-gray-100 dark:border-gray-800 flex flex-col justify-between min-h-[220px] p-6 animate-pulse"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-shrink-0 bg-gray-300 dark:bg-gray-700 rounded-full p-2 w-10 h-10" />
                    <div className="h-6 bg-gray-300 dark:bg-gray-700 rounded w-2/3" />
                  </div>
                  <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded mb-2 w-full" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded mb-4 w-5/6" />
                  <div className="flex items-center justify-between mt-auto pt-2">
                    <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/4" />
                    <div className="h-8 bg-gray-300 dark:bg-gray-700 rounded-full w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : notebooks.length === 0 ? (
            <div className="h-12 flex items-center justify-center text-muted-foreground bg-muted/40 rounded-lg border border-dashed border-muted">
              No courses available yet.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
                {paginatedNotebooks.map((nb) => {
                  const isEnrolled = enrolledIds.includes(nb.id);
                  const summary = getSummaryForNotebook(nb.id);
                  const isFlipped = flippedCards.has(nb.id);
                  return (
                    <motion.div
                      key={nb.id}
                      data-aos="fade-up"
                      whileHover={{ scale: isEnrolled ? 1.08 : 1.02, boxShadow: isEnrolled ? "0 8px 32px 0 rgba(124,37,41,0.16)" : "0 4px 16px 0 rgba(0,0,0,0.1)" }}
                      whileTap={{ scale: isEnrolled ? 0.97 : 1 }}
                      className={`relative rounded-2xl bg-white dark:bg-gray-900 shadow-lg border border-gray-100 dark:border-gray-800 flex flex-col justify-between min-h-[220px] p-6 group overflow-hidden transition-transform duration-200 ${isEnrolled ? 'cursor-pointer' : 'cursor-default'}`}
                      onClick={isEnrolled ? () => router.push(`/notebook/${nb.id}`) : undefined}
                      tabIndex={isEnrolled ? 0 : -1}
                      role={isEnrolled ? "button" : "article"}
                      onKeyDown={isEnrolled ? (e: React.KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Enter' || e.key === ' ') router.push(`/notebook/${nb.id}`); } : undefined}
                      aria-label={isEnrolled ? `Open notebook ${nb.name}` : `Course ${nb.name} - not enrolled`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex-shrink-0 bg-uchicago-crimson/10 rounded-full p-2">
                          <GraduationCap className="w-6 h-6 text-uchicago-crimson animate-bounce group-hover:animate-spin" />
                        </div>
                        <div className="font-bold text-lg truncate" title={nb.name}>{nb.name}</div>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold mb-2">
                        {nb.professor}
                      </div>
                      <div className="text-base text-gray-700 dark:text-gray-200 mb-4 whitespace-pre-line break-words font-medium leading-relaxed">
                        {nb.description}
                      </div>
                      <div className="flex items-center justify-between mt-auto pt-2">
                        <button
                          onClick={(e) => toggleCardFlip(nb.id, e)}
                          className="px-6 py-1 rounded-full bg-uchicago-crimson text-white text-sm font-semibold hover:bg-uchicago-crimson/90 transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 mr-2"
                          title="View course summary"
                        >
                          {isFlipped ? "Course Overview" : "Course Summary"}
                        </button>
                        <Button
                          variant={isEnrolled ? "destructive" : "outline"}
                          className={
                            isEnrolled
                              ? "rounded-full px-6 py-1 text-sm font-semibold shadow-none"
                              : "rounded-full px-6 py-1 text-sm font-semibold border-uchicago-crimson text-uchicago-crimson hover:bg-uchicago-crimson/10 shadow-none"
                          }
                          onClick={e => {
                            e.stopPropagation();
                            if (!isEnrolled) {
                              setShowConfetti(true);
                              setTimeout(() => setShowConfetti(false), 2000);
                            }
                            handleEnrollToggle(nb.id, isEnrolled);
                          }}
                        >
                          {enrollLoadingId === nb.id ? (
                            <Loader2 className="animate-spin h-4 w-4 mr-2" />
                          ) : null}
                          {isEnrolled ? "Disenroll" : "Enroll"}
                        </Button>
                      </div>
                      
                      {/* Statistics overlay */}
                      {isFlipped && (
                        <div className="absolute inset-0 bg-uchicago-crimson text-white rounded-2xl flex flex-col justify-center items-center p-6 z-10">
                          <div className="text-center">
                            <h3 className="text-lg font-bold mb-4">{nb.name}</h3>
                            {summary ? (
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span>Avg Hours:</span>
                                  <span className="font-semibold">{summary.average_hours?.toFixed(1) || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Course Rating:</span>
                                  <span className="font-semibold">{summary.course_ratings?.toFixed(1) || 'N/A'}/5</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Prof Rating:</span>
                                  <span className="font-semibold">{summary.prof_ratings?.toFixed(1) || 'N/A'}/5</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Avg GPA:</span>
                                  <span className="font-semibold">{summary.average_gpa?.toFixed(2) || 'N/A'}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center text-sm">
                                <p>No statistics available</p>
                                <p className="text-xs opacity-75 mt-1">Be the first to review!</p>
                              </div>
                            )}
                            <button
                              onClick={(e) => toggleCardFlip(nb.id, e)}
                              className="mt-4 px-3 py-1.5 rounded-full bg-white text-uchicago-crimson text-xs font-semibold hover:bg-gray-100 transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
                              title="Back to course details"
                            >
                              Back to Course
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
              {totalPages > 1 && (
                <Pagination className="mt-8">
                  <PaginationContent className="gap-2">
                    <PaginationItem className="mx-2">
                      <PaginationPrevious
                        href="#"
                        onClick={e => {
                          e.preventDefault();
                          setCurrentPage(p => Math.max(1, p - 1));
                        }}
                        aria-disabled={currentPage === 1}
                        className={`w-auto px-3 ${currentPage === 1 ? 'opacity-50 pointer-events-none' : ''}`}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <PaginationItem key={i} className="mx-2">
                        <PaginationLink
                          href="#"
                          isActive={currentPage === i + 1}
                          onClick={e => {
                            e.preventDefault();
                            setCurrentPage(i + 1);
                          }}
                        >
                          {i + 1}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem className="mx-2">
                      <PaginationNext
                        href="#"
                        onClick={e => {
                          e.preventDefault();
                          setCurrentPage(p => Math.min(totalPages, p + 1));
                        }}
                        aria-disabled={currentPage === totalPages}
                        className={`w-auto px-3 ${currentPage === totalPages ? 'opacity-50 pointer-events-none' : ''}`}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
} 