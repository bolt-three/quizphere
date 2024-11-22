import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Quiz, Question, Choice } from '../../types/quiz';
import QuestionList from './QuestionList';
import QuestionEditor from './QuestionEditor';
import QuizSettings from './QuizSettings';
import { Save, Share2, Settings as SettingsIcon, Home, Play, AlertTriangle } from 'lucide-react';
import Modal from '../Modal';
import { useAuthStore } from '../../stores/authStore';

interface QuizEditorProps {
  quiz: Quiz;
  onSave: (quiz: Quiz) => void;
  onPublish: (quiz: Quiz) => void;
}

export default function QuizEditor({ quiz: initialQuiz, onSave, onPublish }: QuizEditorProps) {
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<Quiz>(initialQuiz);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);
  const { userId, accessToken } = useAuthStore();

  const handleQuestionUpdate = (updatedQuestion: Question) => {
    setQuiz(prev => ({
      ...prev,
      questions: prev.questions.map(q => 
        q.id === updatedQuestion.id ? updatedQuestion : q
      )
    }));
  };

  const handleAddQuestion = () => {
    const newQuestion: Question = {
      id: crypto.randomUUID(),
      type: quiz.type,
      text: '',
      choices: [],
    };
    
    setQuiz(prev => ({
      ...prev,
      questions: [...prev.questions, newQuestion]
    }));
    setSelectedQuestionId(newQuestion.id);
  };

  const handleDeleteQuestion = (questionId: string) => {
    setQuiz(prev => ({
      ...prev,
      questions: prev.questions.filter(q => q.id !== questionId)
    }));
    if (selectedQuestionId === questionId) {
      setSelectedQuestionId(null);
    }
  };

  const handleReorderQuestions = (reorderedQuestions: Question[]) => {
    setQuiz(prev => ({
      ...prev,
      questions: reorderedQuestions
    }));
  };

  const handleBackToDashboard = () => {
    const currentQuizId = localStorage.getItem('currentQuizId');
    
    // If no currentQuizId, it means the quiz hasn't been saved
    if (!currentQuizId) {
      setShowUnsavedChangesModal(true);
      return;
    }
    
    // If currentQuizId exists, directly navigate
    localStorage.removeItem('currentQuizId');
    navigate('/');
  };

  const handleContinueWithoutSave = () => {
    localStorage.removeItem('currentQuizId');
    setShowUnsavedChangesModal(false);
    navigate('/');
  };

  const handleSaveAndContinue = async () => {
    try {
      // Use the existing handleSave method
      await handleSave();
      
      // Clear currentQuizId and navigate to dashboard
      localStorage.removeItem('currentQuizId');
      setShowUnsavedChangesModal(false);
      navigate('/');
    } catch (error) {
      console.error('Error saving quiz:', error);
      // Optionally show an error to the user
      alert('Failed to save the quiz. Please try again.');
    }
  };

  const handleSave = async () => {
    if (!userId || !accessToken) {
      console.error('User not authenticated');
      return;
    }

    try {
      // Check if there's an existing quiz_id in localStorage
      const existingQuizId = localStorage.getItem('currentQuizId');

      // If existing quiz_id exists, delete the existing quiz first
      if (existingQuizId) {
        try {
          const response = await fetch(`http://localhost:8001/quizzes/${existingQuizId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });

          if (!response.ok) {
            console.warn('Failed to delete existing quiz');
          }
        } catch (deleteError) {
          console.error('Error deleting existing quiz:', deleteError);
        }
      }

      // Save Quiz
      const quizResponse = await fetch('http://localhost:8001/quizzes/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          user_id: userId,
          title: quiz.title,
          language: quiz.language,
          type: quiz.type,
          status: 'draft',
          timeLimit: quiz.timeLimit || 30,
          points: quiz.points || 10
        })
      });

      if (!quizResponse.ok) {
        throw new Error('Failed to save quiz');
      }

      const savedQuizData = await quizResponse.json();
      const quizId = savedQuizData.quiz_id;
      
      // Store the new quiz_id in localStorage
      localStorage.setItem('currentQuizId', quizId);

      console.log('Saved Quiz:', savedQuizData);

      // Save Questions
      for (const question of quiz.questions) {
        const questionResponse = await fetch('http://localhost:8001/questions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            quiz_id: quizId,
            type: question.type,
            text: question.text,
            explanation: question.explanation || ''
          })
        });

        if (!questionResponse.ok) {
          throw new Error(`Failed to save question: ${question.id}`);
        }

        const savedQuestionData = await questionResponse.json();
        const questionId = savedQuestionData.question_id;

        // Save Question Images
        if (question.imageUrls && question.imageUrls.length > 0) {
          for (const imageUrl of question.imageUrls) {
            await fetch('http://localhost:8001/question-images', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
              },
              body: JSON.stringify({
                question_id: questionId,
                image_url: imageUrl
              })
            });
          }
        }

        // Save Choices
        for (const choice of question.choices) {
          await fetch('http://localhost:8001/choices', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
              question_id: questionId,
              text: choice.text,
              is_correct: choice.isCorrect,
              min: choice.min,
              max: choice.max,
              correctValue: choice.correctValue,
              order: choice.order
            })
          });
          console.log('Saved correctValue:', choice.correctValue);
        }
      }

      // Update quiz state and call onSave
      const updatedQuiz: Quiz = {
        ...quiz,
        id: quizId,
        updatedAt: new Date(),
        status: 'draft'
      };

      setQuiz(updatedQuiz);
      onSave(updatedQuiz);
      
      return updatedQuiz;
      
    } catch (error) {
      console.error('Error saving quiz:', error);
      throw error;
    }
  };

  const handleQuizUpdate = (updatedQuiz: Quiz) => {
    setQuiz(updatedQuiz);
  };

  const handlePreview = () => {
    navigate('/preview', { state: { quiz } });
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBackToDashboard}
              className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
              title="Back to Dashboard"
            >
              <Home className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900">{quiz.title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
              title="Quiz Settings"
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
            <button
              onClick={handlePreview}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              title="Preview Quiz"
            >
              <Play className="w-4 h-4 mr-2" />
              Preview
            </button>
            <button
              onClick={handleSave}
              className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Draft
            </button>
            <button
              onClick={() => onPublish(quiz)}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Publish
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Question List */}
        <div className="w-64 border-r border-gray-200 bg-white overflow-y-auto">
          <QuestionList
            questions={quiz.questions}
            selectedId={selectedQuestionId}
            onSelect={setSelectedQuestionId}
            onAdd={handleAddQuestion}
            onDelete={handleDeleteQuestion}
            onReorder={handleReorderQuestions}
          />
        </div>

        {/* Main Content - Question Editor */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="p-6">
            {selectedQuestionId ? (
              <QuestionEditor
                question={quiz.questions.find(q => q.id === selectedQuestionId)!}
                onChange={handleQuestionUpdate}
              />
            ) : (
              <div className="text-center py-12 text-gray-500">
                Select a question to edit or create a new one
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quiz Settings Modal */}
      <Modal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        title="Quiz Settings"
      >
        <QuizSettings
          quiz={quiz}
          onChange={handleQuizUpdate}
          onClose={() => setShowSettings(false)}
        />
      </Modal>

      {/* Unsaved Changes Modal */}
      <Modal
        isOpen={showUnsavedChangesModal}
        onClose={() => setShowUnsavedChangesModal(false)}
        title="Unsaved Changes"
      >
        <div className="p-6">
          <div className="flex items-center mb-4 text-yellow-600">
            <AlertTriangle className="w-8 h-8 mr-3" />
            <p className="text-lg font-semibold">You have unsaved changes</p>
          </div>
          <p className="mb-6 text-gray-600">
            You are about to leave the quiz editor without saving. What would you like to do?
          </p>
          <div className="flex justify-end space-x-3">
            <button
              onClick={handleContinueWithoutSave}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Continue Without Saving
            </button>
            <button
              onClick={handleSaveAndContinue}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Save and Continue
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}