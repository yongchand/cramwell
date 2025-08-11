import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Upload, Star } from 'lucide-react';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  onUpload: (files: FileList | File[], kind: string, metadata?: any) => void;
  isUploading?: boolean;
}

interface ReviewMetadata {
  takenYear?: number;
  takenSemester?: string;
  grade?: string;
  courseReview?: number;
  professorReview?: number;
  inputHours?: number;
}

export function UploadDialog({ open, onClose, onUpload, isUploading = false }: UploadDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [kind, setKind] = useState('general_review');
  const [isUploadInProgress, setIsUploadInProgress] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  
  // Review metadata state
  const [reviewMetadata, setReviewMetadata] = useState<ReviewMetadata>({
    takenYear: new Date().getFullYear(),
    takenSemester: 'Fall',
    grade: 'A',
    courseReview: 5,
    professorReview: 5,
    inputHours: 0
  });

  const handleFiles = (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    setSelectedFiles((prev) => [...prev, ...fileArr]);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    // For general_review, allow upload without files
    if (kind === 'general_review' || selectedFiles.length > 0) {
      setIsUploadInProgress(true);
      setUploadSuccess(false);
      try {
        const metadata = kind === 'general_review' ? reviewMetadata : undefined;
        // For general_review, pass empty array if no files selected
        const filesToUpload = kind === 'general_review' && selectedFiles.length === 0 ? [] : selectedFiles;
        await onUpload(filesToUpload, kind, metadata);
        // Clear files after upload is complete
        setSelectedFiles([]);
        setUploadSuccess(true);
        // Don't call onClose() here - let the parent handle it
      } catch (error) {
        // Error handling is done in the parent component
        console.error('Upload failed:', error);
        // Don't close dialog on error, let user see the error
      } finally {
        setIsUploadInProgress(false);
      }
    }
  };

  const renderStarRating = (value: number, onChange: (value: number) => void, label: string) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex items-center space-x-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className="p-1 hover:scale-110 transition-transform"
          >
            <Star
              className={`h-5 w-5 ${
                star <= value ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
              }`}
            />
          </button>
        ))}
        <span className="ml-2 text-sm text-gray-600">{value}/5</span>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      // Prevent closing during upload
      if (!newOpen && (isUploading || isUploadInProgress)) {
        return;
      }
      if (newOpen) {
        return;
      }
      onClose();
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
        </DialogHeader>
        {uploadSuccess && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-green-800 text-sm">
              ✅ Files uploaded successfully!
            </p>
          </div>
        )}
        
        {/* Kind Selector */}
        <div className="mb-4">
          <Label className="block mb-1 font-medium">Document Type</Label>
          <select
            value={kind}
            onChange={e => setKind(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="general_review">General Review</option>
            <option value="syllabus">Syllabus</option>
            <option value="course_files">Course Files</option>
            <option value="practice_exam">Practice Exam</option>
            <option value="handwritten_notes">Handwritten Notes</option>
          </select>
        </div>

        {/* Review Metadata Form - Only show for general_review */}
        {kind === 'general_review' && (
          <div className="mb-6 p-4 border rounded-lg bg-gray-50">
            <h3 className="text-lg font-semibold mb-4">Course Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="takenYear">Year Taken</Label>
                <Input
                  id="takenYear"
                  type="number"
                  value={reviewMetadata.takenYear || ''}
                  onChange={(e) => setReviewMetadata(prev => ({ ...prev, takenYear: parseInt(e.target.value) || undefined }))}
                  min={2000}
                  max={2030}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="takenSemester">Semester</Label>
                <select
                  id="takenSemester"
                  value={reviewMetadata.takenSemester || ''}
                  onChange={(e) => setReviewMetadata(prev => ({ ...prev, takenSemester: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Fall">Fall</option>
                  <option value="Spring">Spring</option>
                  <option value="Summer">Summer</option>
                  <option value="Winter">Winter</option>
                </select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="grade">Grade Received</Label>
                <select
                  id="grade"
                  value={reviewMetadata.grade || ''}
                  onChange={(e) => setReviewMetadata(prev => ({ ...prev, grade: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="A+">A+</option>
                  <option value="A">A</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B">B</option>
                  <option value="B-">B-</option>
                  <option value="C+">C+</option>
                  <option value="C">C</option>
                  <option value="C-">C-</option>
                  <option value="D+">D+</option>
                  <option value="D">D</option>
                  <option value="D-">D-</option>
                  <option value="F">F</option>
                  <option value="P">P (Pass)</option>
                  <option value="NP">NP (No Pass)</option>
                  <option value="W">W (Withdrawn)</option>
                  <option value="I">I (Incomplete)</option>
                </select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="inputHours">Hours Spent (Optional)</Label>
                <Input
                  id="inputHours"
                  type="number"
                  step="0.5"
                  value={reviewMetadata.inputHours || ''}
                  onChange={(e) => setReviewMetadata(prev => ({ ...prev, inputHours: parseFloat(e.target.value) || undefined }))}
                  placeholder="e.g., 120.5"
                />
              </div>
            </div>
            
            <div className="mt-4 space-y-4">
              {renderStarRating(
                reviewMetadata.courseReview || 5,
                (value) => setReviewMetadata(prev => ({ ...prev, courseReview: value })),
                "Course Review (1-5 stars)"
              )}
              
              {renderStarRating(
                reviewMetadata.professorReview || 5,
                (value) => setReviewMetadata(prev => ({ ...prev, professorReview: value })),
                "Professor Review (1-5 stars)"
              )}
            </div>
          </div>
        )}

        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${dragActive ? 'border-primary bg-muted' : 'border-muted'}`}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          style={{ cursor: 'pointer' }}
        >
          <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          {kind === 'general_review' ? (
            <>
              <p className="mb-2 text-muted-foreground">Optional: Drag & drop course files here, or click to select</p>
              <p className="text-xs text-muted-foreground mb-2">
                You can save review information without uploading files
              </p>
            </>
          ) : (
            <>
              <p className="mb-2 text-muted-foreground">Drag & drop files here, or click to select</p>
              <p className="text-xs text-muted-foreground mb-2">
                Supported: PDF, DOC, DOCX, PPT, PPTX, XLSX, CSV, IPYNB (max 25MB each)
              </p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInput}
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xlsx,.csv,.ipynb"
          />
        </div>
        
        {selectedFiles.length > 0 && (
          <div className="mt-4 max-h-40 overflow-y-auto border rounded-md p-2 bg-muted">
            <ul className="text-sm">
              {selectedFiles.map((file, idx) => (
                <li key={idx} className="flex items-center justify-between py-1">
                  <span className="truncate max-w-xs">{file.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => handleRemoveFile(idx)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        <DialogFooter className="mt-4">
          {uploadSuccess ? (
            <>
              <Button variant="outline" onClick={onClose} type="button">
                Close
              </Button>
              <Button onClick={() => { setUploadSuccess(false); setSelectedFiles([]); }} type="button">
                Upload More
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} type="button" disabled={isUploading || isUploadInProgress}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={(selectedFiles.length === 0 && kind !== 'general_review') || isUploading || isUploadInProgress} type="button">
                {(isUploading || isUploadInProgress) ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                    Uploading...
                  </>
                ) : (
                  kind === 'general_review' ? 'Save Review' : 'Upload'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 