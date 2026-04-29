'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Edit3, Save, X, ChevronRight, FolderTree, Layers } from 'lucide-react';
import type { Chapter } from '@/lib/types';
import { chaptersApi } from '@/lib/chapters-api';

interface ChapterManagerProps {
  isOpen: boolean;
  onClose: () => void;
  noteId?: string;
  selectedChapterId?: string;
  onSelectChapter?: (chapterId: string | undefined) => void;
}

export function ChapterManager({ isOpen, onClose, noteId, selectedChapterId, onSelectChapter }: ChapterManagerProps) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Chapter>>({});
  const [newName, setNewName] = useState('');
  const [showAddChild, setShowAddChild] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadChapters = useCallback(async () => {
    try {
      const data = noteId ? await chaptersApi.getByNoteId(noteId) : await chaptersApi.getTemplates();
      setChapters(data);
      setLoadError(false);
    } catch (err) {
      console.error('Failed to load chapters:', err);
      setLoadError(true);
    }
  }, [noteId]);

  useEffect(() => {
    if (isOpen) loadChapters();
  }, [isOpen, loadChapters]);

  const topLevel = chapters.filter(c => !c.parentId);
  const getChildren = (parentId: string) => chapters.filter(c => c.parentId === parentId);

  const handleCreate = async (parentId?: string) => {
    if (!newName.trim()) return;
    setError(null);
    try {
      await chaptersApi.create({
        noteId,
        name: newName.trim(),
        parentId,
        sortOrder: chapters.length,
      });
      setNewName('');
      setShowAddChild(null);
      loadChapters();
    } catch (err) {
      console.error('Failed to create chapter:', err);
      setError('创建失败，请确认 Supabase 中已创建 chapters 表（运行 supabase/chapters_schema.sql）');
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editForm.name?.trim()) return;
    setError(null);
    try {
      await chaptersApi.update(id, editForm);
      setEditingId(null);
      setEditForm({});
      loadChapters();
    } catch (err) {
      console.error('Failed to update chapter:', err);
      setError('更新失败，请重试');
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await chaptersApi.delete(id);
      if (selectedChapterId === id && onSelectChapter) onSelectChapter(undefined);
      loadChapters();
    } catch (err) {
      console.error('Failed to delete chapter:', err);
      setError('删除失败，请重试');
    }
  };

  const startEdit = (chapter: Chapter) => {
    setEditingId(chapter.id);
    setEditForm({ name: chapter.name, description: chapter.description, color: chapter.color });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="absolute inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-md md:h-auto max-h-[85vh] bg-surface-container-lowest rounded-2xl shadow-elevated flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
            <h2 className="text-lg font-bold text-on-surface font-headline flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              章节管理
            </h2>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-container-high transition-colors">
              <X className="w-5 h-5 text-on-surface-variant" />
            </button>
          </div>

          {/* Chapter Tree */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {loadError && (
              <div className="p-3 rounded-xl bg-amber-50 text-amber-700 text-sm mb-3">
                无法加载章节，请确认 Supabase 中已创建 chapters 表。运行: supabase/chapters_schema.sql
              </div>
            )}
            {error && (
              <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm mb-3 flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-2">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {topLevel.length === 0 && !showAddChild && (
              <p className="text-sm text-on-surface-variant/50 text-center py-8">
                暂无章节，点击下方按钮创建
              </p>
            )}

            {topLevel.map(chapter => (
              <ChapterNode
                key={chapter.id}
                chapter={chapter}
                children={getChildren(chapter.id)}
                isSelected={chapter.id === selectedChapterId}
                onSelect={() => onSelectChapter?.(chapter.id)}
                onEdit={() => startEdit(chapter)}
                onDelete={() => handleDelete(chapter.id)}
                onAddChild={() => setShowAddChild(chapter.id)}
                editingId={editingId}
                editForm={editForm}
                onEditFormChange={setEditForm}
                onSaveEdit={() => handleUpdate(chapter.id)}
                onCancelEdit={() => { setEditingId(null); setEditForm({}); }}
                showAddChild={showAddChild}
                newChildName={newName}
                onNewChildNameChange={setNewName}
                onConfirmChild={() => handleCreate(chapter.id)}
                selectedChapterId={selectedChapterId}
                onChildSelect={(childId) => onSelectChapter?.(childId)}
                onChildEdit={(child) => startEdit(child)}
                onChildDelete={(childId) => handleDelete(childId)}
                onChildAddChild={(childId) => setShowAddChild(childId)}
                onChildSaveEdit={(childId) => handleUpdate(childId)}
                onChildConfirmChild={(childId) => handleCreate(childId)}
              />
            ))}

            {/* Add root chapter */}
            {showAddChild === '__root__' ? (
              <div className="flex gap-2 p-3 bg-surface-container-low rounded-xl">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="章节名称..."
                  className="flex-1 px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                  autoFocus
                />
                <button onClick={() => handleCreate()}
                  className="px-3 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium">
                  添加
                </button>
                <button onClick={() => setShowAddChild(null)}
                  className="px-3 py-2 rounded-lg bg-surface-container text-on-surface-variant text-sm">
                  取消
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddChild('__root__')}
                className="w-full px-4 py-3 rounded-xl border-2 border-dashed border-outline-variant/30 text-on-surface-variant hover:border-primary/50 hover:text-primary transition-all flex items-center justify-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                添加章节
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Props interface for ChapterNode
interface ChapterNodeProps {
  chapter: Chapter;
  children: Chapter[];
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddChild: () => void;
  editingId: string | null;
  editForm: Partial<Chapter>;
  onEditFormChange: (form: Partial<Chapter>) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  showAddChild: string | null;
  newChildName: string;
  onNewChildNameChange: (name: string) => void;
  onConfirmChild: () => void;
  selectedChapterId: string | undefined;
  // Recursive children callbacks
  onChildSelect: (chapterId: string) => void;
  onChildEdit: (chapter: Chapter) => void;
  onChildDelete: (chapterId: string) => void;
  onChildAddChild: (chapterId: string) => void;
  onChildSaveEdit: (chapterId: string) => void;
  onChildConfirmChild: (chapterId: string) => void;
}

function ChapterNode({
  chapter, children, isSelected, onSelect, onEdit, onDelete, onAddChild,
  editingId, editForm, onEditFormChange, onSaveEdit, onCancelEdit,
  showAddChild, newChildName, onNewChildNameChange, onConfirmChild,
  selectedChapterId,
  onChildSelect, onChildEdit, onChildDelete, onChildAddChild,
  onChildSaveEdit, onChildConfirmChild,
}: ChapterNodeProps) {
  const isEditing = editingId === chapter.id;
  const isShowingAdd = showAddChild === chapter.id;

  return (
    <div className="space-y-1">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-colors ${
        isSelected ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-surface-container-low'
      }`}>
        <button onClick={onSelect} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          <FolderTree className="w-4 h-4 text-on-surface-variant/50 flex-shrink-0" />
          {isEditing ? (
            <input
              type="text"
              value={editForm.name || ''}
              onChange={e => onEditFormChange({ ...editForm, name: e.target.value })}
              className="flex-1 px-2 py-1 bg-surface-container rounded text-sm text-on-surface outline-none focus:ring-1 focus:ring-primary/20"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(); if (e.key === 'Escape') onCancelEdit(); }}
            />
          ) : (
            <span className="text-sm font-medium text-on-surface truncate">{chapter.name}</span>
          )}
        </button>

        <div className="flex items-center gap-0.5">
          {isEditing ? (
            <>
              <button onClick={onSaveEdit} className="p-1.5 rounded-lg hover:bg-primary/10 text-primary">
                <Save className="w-3.5 h-3.5" />
              </button>
              <button onClick={onCancelEdit} className="p-1.5 rounded-lg hover:bg-surface-container-highest text-on-surface-variant">
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <button onClick={onAddChild} className="p-1.5 rounded-lg hover:bg-surface-container-highest text-on-surface-variant/50" title="添加子章节">
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-surface-container-highest text-on-surface-variant/50" title="编辑">
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-on-surface-variant/50 hover:text-red-500" title="删除">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Children */}
      {children.map((child: Chapter) => (
        <div key={child.id} className="ml-6">
          <ChapterNode
            chapter={child}
            children={[]}
            isSelected={child.id === selectedChapterId}
            onSelect={() => onChildSelect(child.id)}
            onEdit={() => onChildEdit(child)}
            onDelete={() => onChildDelete(child.id)}
            onAddChild={() => onChildAddChild(child.id)}
            editingId={editingId}
            editForm={editForm}
            onEditFormChange={onEditFormChange}
            onSaveEdit={() => onChildSaveEdit(child.id)}
            onCancelEdit={onCancelEdit}
            showAddChild={showAddChild}
            newChildName={newChildName}
            onNewChildNameChange={onNewChildNameChange}
            onConfirmChild={() => onChildConfirmChild(child.id)}
            selectedChapterId={selectedChapterId}
            onChildSelect={onChildSelect}
            onChildEdit={onChildEdit}
            onChildDelete={onChildDelete}
            onChildAddChild={onChildAddChild}
            onChildSaveEdit={onChildSaveEdit}
            onChildConfirmChild={onChildConfirmChild}
          />
        </div>
      ))}

      {/* Add child input */}
      {isShowingAdd && (
        <div className="ml-6 flex gap-2 p-2 bg-surface-container-low rounded-xl">
          <input
            type="text"
            value={newChildName}
            onChange={e => onNewChildNameChange(e.target.value)}
            placeholder="子章节名称..."
            className="flex-1 px-3 py-1.5 bg-surface-container rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary/20"
            onKeyDown={e => { if (e.key === 'Enter') onConfirmChild(); }}
            autoFocus
          />
          <button onClick={onConfirmChild} className="px-2.5 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-medium">添加</button>
        </div>
      )}
    </div>
  );
}
