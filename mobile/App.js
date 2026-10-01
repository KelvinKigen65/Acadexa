import "./global.css";

import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import {
  API_BASE_URL,
  apiErrorMessage,
  askCourseQuestion,
  authenticate,
  clearSession,
  createConversation,
  getCurrentUser,
  hasSession,
  listCourses,
  listDocuments,
  provisionWorkspace,
  uploadPdf,
} from "./src/api";
import {
  answerFromPreview,
  initialCourses,
  initialMessages,
  previewSources,
  sourceFromCitation,
} from "./src/data";

function Icon({ name, size = 18, color }) {
  return <Feather name={name} size={size} color={color} />;
}

function Reveal({ children, delay = 0 }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 360, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 360, delay, useNativeDriver: true }),
    ]).start();
  }, [delay, opacity, translateY]);

  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

function BrandMark() {
  return (
    <View className="h-8 w-8 items-center justify-center rounded-full border border-[#8facf0] bg-[#1b3156]">
      <View className="h-3.5 w-3.5 -rotate-45 rounded-sm border border-[#c8d9ff]" />
    </View>
  );
}

function CircleButton({ accessibilityLabel, children, onPress, light = false }) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      className={`h-10 w-10 items-center justify-center rounded-full ${light ? "bg-white" : "bg-[#20375f]"}`}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}
    >
      {children}
    </Pressable>
  );
}

function Toast({ message }) {
  if (!message) return null;
  return (
    <View className="absolute bottom-24 left-5 right-5 z-50 flex-row items-center gap-2 rounded-2xl border border-[#d9e3f5] bg-[#f8fbff] px-4 py-3 shadow-lg">
      <Icon name="sparkles" size={16} color="#4168bc" />
      <Text className="flex-1 text-[12px] leading-5 text-[#425475]">{message}</Text>
    </View>
  );
}

function CitationButton({ source, position, onPress }) {
  if (!source) return null;
  return (
    <Pressable
      className="mt-3 flex-row items-center gap-2 rounded-xl border border-[#d9e3f5] bg-[#f6f9ff] px-3 py-2.5"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <View className="h-5 w-5 items-center justify-center rounded-full bg-[#e0eafe]">
        <Text className="text-[10px] font-bold text-[#4168bc]">{position}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-[11px] font-semibold text-[#3b4c64]" numberOfLines={1}>{source.title}</Text>
        <Text className="mt-0.5 text-[10px] text-[#7e899a]">{source.pages}</Text>
      </View>
      <Icon name="arrow-up-right" size={15} color="#6b7fa9" />
    </Pressable>
  );
}

function Message({ item, sources, onOpenEvidence, index }) {
  const assistant = item.role === "assistant";
  const messageSources = (item.citations ?? []).map((id) => sources.find((source) => source.id === id)).filter(Boolean);
  const label = !assistant
    ? "You"
    : item.mode === "insufficient-context"
      ? "Acadexa · Insufficient material"
      : item.mode === "preview"
        ? "Acadexa · Course preview"
        : "Acadexa";

  return (
    <Reveal delay={Math.min(index * 70, 280)}>
      <View className={`mb-7 flex-row ${assistant ? "items-start" : "justify-end"}`}>
        {assistant && (
          <View className="mr-2 mt-0.5 h-8 w-8 items-center justify-center rounded-full bg-[#e7eefc]">
            <Icon name="sparkles" size={15} color="#4168bc" />
          </View>
        )}
        <View className={assistant ? "max-w-[84%] flex-1" : "max-w-[82%]"}>
          <Text className={`mb-2 text-[10px] font-bold uppercase tracking-widest ${assistant ? "text-[#758197]" : "text-right text-[#758197]"}`}>{label}</Text>
          <View className={`rounded-2xl px-4 py-3.5 ${assistant ? "border border-[#e5e2da] bg-white" : "bg-[#203d70]"}`}>
            <Text className={`text-[16px] leading-6 ${assistant ? "text-[#2b3950]" : "text-white"}`}>{item.text}</Text>
          </View>
          {assistant && messageSources.map((source, sourceIndex) => (
            <CitationButton
              key={source.id}
              source={source}
              position={sourceIndex + 1}
              onPress={() => onOpenEvidence(source.id)}
            />
          ))}
        </View>
      </View>
    </Reveal>
  );
}

function Composer({ course, query, setQuery, isAnswering, onSend, onAddContext }) {
  return (
    <View className="border-t border-line bg-paper px-4 pb-3 pt-3">
      <View className="rounded-2xl border border-[#d9dfe9] bg-white px-3.5 pb-2 pt-2.5 shadow-sm">
        <TextInput
          accessibilityLabel="Ask Acadexa"
          className="min-h-[42px] max-h-28 px-0 text-[15px] leading-5 text-ink"
          multiline
          onChangeText={setQuery}
          onSubmitEditing={onSend}
          placeholder={`Ask about ${course.name}…`}
          placeholderTextColor="#9aa2ae"
          returnKeyType="send"
          value={query}
        />
        <View className="mt-1 flex-row items-center justify-between">
          <Pressable className="flex-row items-center gap-1.5 rounded-lg px-1 py-1.5" onPress={onAddContext}>
            <Icon name="plus" size={16} color="#5b72a9" />
            <Text className="text-[11px] font-semibold text-[#5b72a9]">Add context</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Send question"
            className={`h-9 w-9 items-center justify-center rounded-xl ${query.trim() && !isAnswering ? "bg-action" : "bg-[#c7cfda]"}`}
            disabled={!query.trim() || isAnswering}
            onPress={onSend}
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.94 : 1 }] })}
          >
            {isAnswering ? <ActivityIndicator size="small" color="white" /> : <Icon name="arrow-up" size={18} color="white" />}
          </Pressable>
        </View>
      </View>
      <View className="mt-2 flex-row items-center justify-center gap-1.5">
        <Icon name="sparkles" size={13} color="#6f8dce" />
        <Text className="text-[10px] text-[#8993a2]">Answers are grounded in your selected source.</Text>
      </View>
    </View>
  );
}

function AskScreen({
  course,
  messages,
  sources,
  query,
  setQuery,
  isAnswering,
  onSend,
  onAddContext,
  onOpenEvidence,
  onNewConversation,
  onShowCourses,
}) {
  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
      <View className="flex-1 bg-paper">
        <View className="flex-row items-center justify-between bg-navy px-5 pb-4 pt-3">
          <Pressable className="flex-row items-center gap-2" onPress={onShowCourses}>
            <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: course.color }} />
            <Text className="max-w-[190px] text-[14px] font-semibold text-white" numberOfLines={1}>{course.name}</Text>
            <Icon name="chevron-down" size={16} color="#aebed9" />
          </Pressable>
          <CircleButton accessibilityLabel="Start a new conversation" onPress={onNewConversation}>
            <Icon name="edit-3" size={17} color="#d7e3f9" />
          </CircleButton>
        </View>

        <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8 pt-7" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Reveal>
            <View className="mb-9">
              <Text className="text-[10px] font-bold uppercase tracking-[2px] text-[#5d78b6]">Source-grounded study assistant</Text>
              <Text className="mt-3 max-w-[330px] font-serif text-[38px] leading-[41px] tracking-tight text-ink">What are you working through?</Text>
              <Text className="mt-4 max-w-[342px] text-[14px] leading-6 text-muted">Ask about your course material. Every answer leads you back to its supporting page.</Text>
            </View>
          </Reveal>

          {messages.length === 0 ? (
            <Reveal delay={110}>
              <View className="items-center border-t border-line py-16">
                <View className="mb-4 h-11 w-11 items-center justify-center rounded-full bg-[#e7eefc]">
                  <Icon name="sparkles" size={20} color="#4168bc" />
                </View>
                <Text className="font-serif text-[25px] text-ink">A fresh page.</Text>
                <Text className="mt-2 max-w-[260px] text-center text-[13px] leading-5 text-muted">Ask a focused question or upload a lecture note to begin.</Text>
              </View>
            </Reveal>
          ) : messages.map((item, index) => (
            <Message item={item} key={item.id} sources={sources} index={index} onOpenEvidence={onOpenEvidence} />
          ))}
        </ScrollView>

        <Composer course={course} query={query} setQuery={setQuery} isAnswering={isAnswering} onSend={onSend} onAddContext={onAddContext} />
      </View>
    </KeyboardAvoidingView>
  );
}

function CourseRow({ course, active, onPress }) {
  return (
    <Pressable className={`flex-row items-center gap-3 border-b border-[#ece9e2] px-1 py-4 ${active ? "bg-[#f4f7fc]" : ""}`} onPress={onPress}>
      <View className="h-9 w-1 rounded-full" style={{ backgroundColor: course.color }} />
      <View className="flex-1">
        <Text className="text-[14px] font-semibold text-[#27364d]">{course.name}</Text>
        <Text className="mt-1 text-[11px] text-muted">{course.code} · {course.count} sources</Text>
      </View>
      {active ? <Icon name="check" size={18} color="#4168bc" /> : <Icon name="chevron-right" size={18} color="#a1aab8" />}
    </Pressable>
  );
}

function SourceRow({ source, selected, onPress, remote = false }) {
  const title = remote ? source.title : source.title;
  const details = remote
    ? `${source.page_count ?? "–"} pages · ${source.status ?? "processing"}`
    : `${source.pages} · ${source.meta}`;
  return (
    <Pressable className={`flex-row items-center gap-3 border-b border-[#ece9e2] px-1 py-4 ${selected ? "bg-[#f4f7fc]" : ""}`} onPress={onPress}>
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-[#eaf0fc]">
        <Icon name="file-text" size={18} color="#5272b5" />
      </View>
      <View className="flex-1">
        <Text className="text-[13px] font-semibold text-[#35445b]" numberOfLines={1}>{title}</Text>
        <Text className="mt-1 text-[11px] text-muted" numberOfLines={1}>{details}</Text>
      </View>
      {selected ? <Icon name="check-circle" size={18} color="#4168bc" /> : <Icon name="chevron-right" size={18} color="#a1aab8" />}
    </Pressable>
  );
}

function LibraryScreen({ courses, course, sources, resources, account, selectedResourceId, onSelectCourse, onSelectResource, onAddSource }) {
  const remote = Boolean(account);
  return (
    <ScrollView className="flex-1 bg-paper" contentContainerClassName="px-5 pb-8 pt-7" showsVerticalScrollIndicator={false}>
      <Reveal>
        <Text className="text-[10px] font-bold uppercase tracking-[2px] text-[#5d78b6]">Your study space</Text>
        <Text className="mt-3 font-serif text-[36px] leading-[40px] tracking-tight text-ink">Library</Text>
        <Text className="mt-3 max-w-[325px] text-[14px] leading-6 text-muted">Keep a focused course library and choose the PDF Acadexa should use for answers.</Text>
      </Reveal>

      <Reveal delay={80}>
        <View className="mt-9 border-t border-line pt-2">
          <Text className="py-3 text-[10px] font-bold uppercase tracking-[1.8px] text-[#7d899b]">Courses</Text>
          {courses.map((item) => <CourseRow active={item.id === course.id} course={item} key={item.id} onPress={() => onSelectCourse(item)} />)}
        </View>
      </Reveal>

      <Reveal delay={150}>
        <View className="mt-8 border-t border-line pt-2">
          <View className="flex-row items-center justify-between py-3">
            <Text className="text-[10px] font-bold uppercase tracking-[1.8px] text-[#7d899b]">Sources</Text>
            <Pressable className="flex-row items-center gap-1.5 rounded-lg bg-[#e9effa] px-3 py-2" onPress={onAddSource}>
              <Icon name="plus" size={14} color="#4168bc" />
              <Text className="text-[11px] font-bold text-[#4168bc]">Add PDF</Text>
            </Pressable>
          </View>
          {sources.length ? sources.map((item) => (
            <SourceRow
              key={item.id}
              onPress={() => onSelectResource(item)}
              remote={remote}
              selected={remote ? selectedResourceId === item.id : false}
              source={item}
            />
          )) : (
            <View className="border-b border-[#ece9e2] py-8">
              <Text className="text-[13px] font-semibold text-[#526178]">No PDFs in this course yet.</Text>
              <Text className="mt-1 text-[12px] leading-5 text-muted">Add a lecture note or study guide to start asking grounded questions.</Text>
            </View>
          )}
        </View>
      </Reveal>

      {!account && (
        <Reveal delay={220}>
          <View className="mt-8 border-l-2 border-[#7994ce] bg-[#f0f4fb] px-4 py-4">
            <Text className="text-[12px] font-bold text-[#344d7d]">Preview library</Text>
            <Text className="mt-1 text-[12px] leading-5 text-[#617090]">Sign in to connect your own course PDFs and keep them available across devices.</Text>
          </View>
        </Reveal>
      )}
    </ScrollView>
  );
}

function AccountScreen({ account, resources, onOpenAuth, onSignOut }) {
  if (!account) {
    return (
      <ScrollView className="flex-1 bg-navy" contentContainerClassName="min-h-full justify-between px-5 pb-10 pt-8">
        <Reveal>
          <BrandMark />
          <Text className="mt-9 max-w-[300px] font-serif text-[42px] leading-[44px] tracking-tight text-white">Make every answer traceable.</Text>
          <Text className="mt-5 max-w-[315px] text-[15px] leading-6 text-[#b9c7df]">Save your sources, ask from a specific PDF, and return to the evidence whenever you need it.</Text>
        </Reveal>
        <Reveal delay={120}>
          <Pressable className="flex-row items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4" onPress={onOpenAuth}>
            <Icon name="log-in" size={18} color="#203d70" />
            <Text className="text-[14px] font-bold text-[#203d70]">Sign in to your library</Text>
          </Pressable>
          <Text className="mt-4 text-center text-[11px] leading-5 text-[#91a4c5]">Your PDFs remain tied to your account and are not shared with other students.</Text>
        </Reveal>
      </ScrollView>
    );
  }

  const displayName = account.display_name || account.email;
  const initials = displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <ScrollView className="flex-1 bg-paper" contentContainerClassName="px-5 pb-8 pt-7">
      <Reveal>
        <Text className="text-[10px] font-bold uppercase tracking-[2px] text-[#5d78b6]">Your account</Text>
        <Text className="mt-3 font-serif text-[36px] tracking-tight text-ink">Study profile</Text>
        <View className="mt-8 flex-row items-center gap-4 border-y border-line py-5">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-[#e7c189]">
            <Text className="text-[16px] font-bold text-[#283b5b]">{initials}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-bold text-[#2a3951]">{displayName}</Text>
            <Text className="mt-1 text-[12px] text-muted">{account.email}</Text>
          </View>
        </View>
      </Reveal>
      <Reveal delay={100}>
        <View className="mt-8 flex-row gap-3">
          <View className="flex-1 border-l-2 border-[#6f8dce] bg-[#f0f4fb] px-4 py-4">
            <Text className="text-[24px] font-bold text-[#2d4d85]">{resources.length}</Text>
            <Text className="mt-1 text-[11px] font-semibold text-[#617090]">Saved PDFs</Text>
          </View>
          <View className="flex-1 border-l-2 border-[#79b6a4] bg-[#f2f7f4] px-4 py-4">
            <Text className="text-[24px] font-bold text-[#386c5b]">Grounded</Text>
            <Text className="mt-1 text-[11px] font-semibold text-[#5b7e74]">Answer mode</Text>
          </View>
        </View>
      </Reveal>
      <Reveal delay={160}>
        <Pressable className="mt-9 flex-row items-center justify-between border-y border-line py-4" onPress={onSignOut}>
          <View className="flex-row items-center gap-3">
            <Icon name="log-out" size={18} color="#a05a5a" />
            <Text className="text-[14px] font-semibold text-[#8f5151]">Sign out</Text>
          </View>
          <Icon name="chevron-right" size={18} color="#a1aab8" />
        </Pressable>
      </Reveal>
    </ScrollView>
  );
}

function EvidenceSheet({ visible, onClose, sources, selectedSourceId, setSelectedSourceId, resources, selectedResourceId, onSelectResource, focusTopic, setFocusTopic, account, onOpenAuth, notify }) {
  const activeSource = sources.find((source) => source.id === selectedSourceId) ?? sources[0];
  const isPreview = activeSource && !String(activeSource.id).startsWith("chunk-");

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View className="flex-1 justify-end bg-black/35">
        <SafeAreaView edges={["bottom"]} className="max-h-[88%] rounded-t-[30px] bg-[#fcfbf8]">
          <View className="items-center pt-3">
            <View className="h-1.5 w-10 rounded-full bg-[#cfd5de]" />
          </View>
          <View className="flex-row items-start justify-between px-5 pb-5 pt-5">
            <View>
              <Text className="text-[10px] font-bold uppercase tracking-[1.8px] text-[#5d78b6]">Answer evidence</Text>
              <Text className="mt-1 font-serif text-[30px] tracking-tight text-ink">Sources</Text>
            </View>
            <CircleButton accessibilityLabel="Close sources" light onPress={onClose}>
              <Icon name="x" size={20} color="#56647a" />
            </CircleButton>
          </View>
          <ScrollView className="px-5" contentContainerClassName="pb-8" showsVerticalScrollIndicator={false}>
            <View className="mb-4 flex-row items-center gap-2 border-b border-line pb-4">
              <Icon name="sparkles" size={15} color="#5577bd" />
              <Text className="text-[12px] font-bold text-[#52617a]">{sources.length ? `${sources.length} verified source${sources.length === 1 ? "" : "s"}` : "No matching sources"}</Text>
            </View>

            {sources.map((source, index) => (
              <Pressable
                className={`mb-2 flex-row items-center gap-3 rounded-xl border px-3 py-3 ${selectedSourceId === source.id ? "border-[#cad8f2] bg-[#f0f4fb]" : "border-transparent bg-white"}`}
                key={source.id}
                onPress={() => setSelectedSourceId(source.id)}
              >
                <View className="h-6 w-6 items-center justify-center rounded-full bg-[#e4ecfc]">
                  <Text className="text-[10px] font-bold text-[#4568ad]">{index + 1}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-[12px] font-semibold text-[#3b4c64]" numberOfLines={1}>{source.title}</Text>
                  <Text className="mt-1 text-[10px] text-[#8993a2]">{source.pages} · {source.meta}</Text>
                </View>
                <Icon name="chevron-right" size={16} color="#8c9aaf" />
              </Pressable>
            ))}

            {account ? (
              <View className="mt-5 border-t border-line pt-5">
                <Text className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#77859b]">Ask from this uploaded PDF</Text>
                {resources.length ? resources.map((resource) => (
                  <Pressable className={`mt-2 flex-row items-center gap-3 rounded-xl px-3 py-3 ${selectedResourceId === resource.id ? "bg-[#eaf0fc]" : "bg-white"}`} key={resource.id} onPress={() => onSelectResource(resource)}>
                    <Icon name="file-text" size={16} color="#5a78b4" />
                    <View className="flex-1">
                      <Text className="text-[12px] font-semibold text-[#41516a]" numberOfLines={1}>{resource.title}</Text>
                      <Text className="mt-1 text-[10px] text-[#8993a2]">{resource.page_count ?? "–"} pages · {resource.status}</Text>
                    </View>
                    {selectedResourceId === resource.id && <Icon name="check" size={16} color="#4168bc" />}
                  </Pressable>
                )) : <Text className="mt-3 text-[12px] leading-5 text-muted">Upload a PDF in Library, then select it here.</Text>}
                <Text className="mt-5 text-[10px] font-bold uppercase tracking-[1.5px] text-[#77859b]">Focus topic (optional)</Text>
                <TextInput className="mt-2 rounded-xl border border-[#d9dfe9] bg-white px-3 py-3 text-[13px] text-[#44546c]" onChangeText={setFocusTopic} placeholder="e.g. network congestion" placeholderTextColor="#9aa2ae" value={focusTopic} />
              </View>
            ) : (
              <Pressable className="mt-5 flex-row items-center justify-between border-t border-line pt-5" onPress={onOpenAuth}>
                <View><Text className="text-[13px] font-semibold text-[#405578]">Connect your library</Text><Text className="mt-1 text-[11px] text-muted">Sign in to ask from your own PDF.</Text></View>
                <Icon name="arrow-right" size={18} color="#4168bc" />
              </Pressable>
            )}

            {activeSource && (
              <View className="mt-6 border-t border-line pt-5">
                <View className="border border-[#e5e0d5] bg-[#fffdf8] px-5 py-5 shadow-sm">
                  <View className="flex-row justify-between border-b border-[#e9e3d8] pb-3"><Text className="text-[8px] font-bold tracking-wider text-[#9f978c]">{isPreview ? "CS 304 · COMPUTER NETWORKS" : "RETRIEVED EVIDENCE"}</Text><Text className="text-[8px] font-bold text-[#9f978c]">{activeSource.pages}</Text></View>
                  <Text className="mt-5 font-serif text-[22px] leading-7 text-[#394257]">{activeSource.title.replace("Lecture 05 — ", "")}</Text>
                  <View className="my-4 h-0.5 w-9 bg-[#8097c9]" />
                  <Text className="text-[13px] leading-6 text-[#747166]">{isPreview ? "TCP provides a reliable, connection-oriented service to applications. It uses acknowledgements, sequence numbers, and flow control to support ordered delivery." : "This passage was retrieved from your selected document as evidence for the answer above."}</Text>
                </View>
                <Pressable className="mt-2 flex-row items-center gap-2 self-start py-2" onPress={() => notify(`${activeSource.title} would open at ${activeSource.pages}.`)}>
                  <Icon name="file-text" size={16} color="#4468ae" />
                  <Text className="text-[12px] font-bold text-[#4468ae]">Open source document</Text>
                  <Icon name="arrow-up-right" size={15} color="#4468ae" />
                </Pressable>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function AuthSheet({ visible, mode, setMode, form, setForm, error, submitting, onSubmit, onClose }) {
  const register = mode === "register";
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView className="flex-1 justify-end bg-black/40" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <SafeAreaView edges={["bottom"]} className="rounded-t-[30px] bg-[#fcfbf8] px-5 pb-6 pt-3">
          <View className="items-center"><View className="h-1.5 w-10 rounded-full bg-[#cfd5de]" /></View>
          <View className="mt-5 flex-row items-start justify-between">
            <View className="flex-1 pr-4"><Text className="text-[10px] font-bold uppercase tracking-[1.8px] text-[#5d78b6]">Secure workspace</Text><Text className="mt-2 font-serif text-[31px] leading-9 tracking-tight text-ink">{register ? "Create your Acadexa account" : "Welcome back"}</Text></View>
            <CircleButton accessibilityLabel="Close sign in" light onPress={onClose}><Icon name="x" size={20} color="#56647a" /></CircleButton>
          </View>
          <Text className="mt-3 text-[13px] leading-5 text-muted">Sign in to save PDFs in your own course library.</Text>
          {register && <View className="mt-5 flex-row gap-3"><TextInput autoCapitalize="words" className="flex-1 rounded-xl border border-[#d9dfe2] bg-white px-3 py-3 text-[14px] text-ink" onChangeText={(value) => setForm((current) => ({ ...current, firstName: value }))} placeholder="First name" placeholderTextColor="#9aa2ae" value={form.firstName} /><TextInput autoCapitalize="words" className="flex-1 rounded-xl border border-[#d9dfe2] bg-white px-3 py-3 text-[14px] text-ink" onChangeText={(value) => setForm((current) => ({ ...current, lastName: value }))} placeholder="Last name" placeholderTextColor="#9aa2ae" value={form.lastName} /></View>}
          <TextInput autoCapitalize="none" autoComplete="email" className="mt-3 rounded-xl border border-[#d9dfe2] bg-white px-3 py-3 text-[14px] text-ink" keyboardType="email-address" onChangeText={(value) => setForm((current) => ({ ...current, email: value }))} placeholder="Email" placeholderTextColor="#9aa2ae" value={form.email} />
          <TextInput autoComplete={register ? "new-password" : "password"} className="mt-3 rounded-xl border border-[#d9dfe2] bg-white px-3 py-3 text-[14px] text-ink" onChangeText={(value) => setForm((current) => ({ ...current, password: value }))} placeholder="Password (12+ characters)" placeholderTextColor="#9aa2ae" secureTextEntry value={form.password} />
          {error ? <Text className="mt-3 text-[12px] leading-5 text-[#aa4f4f]">{error}</Text> : null}
          <View className="mt-5 flex-row items-center justify-between gap-4"><Pressable onPress={() => setMode(register ? "login" : "register")}><Text className="text-[12px] font-bold text-[#5272b5]">{register ? "I already have an account" : "Create an account"}</Text></Pressable><Pressable className="min-w-[116px] items-center rounded-xl bg-action px-4 py-3" disabled={submitting} onPress={onSubmit}>{submitting ? <ActivityIndicator color="white" /> : <Text className="text-[13px] font-bold text-white">{register ? "Create account" : "Sign in"}</Text>}</Pressable></View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CourseSheet({ visible, courses, activeId, onSelect, onClose }) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View className="flex-1 justify-end bg-black/35">
        <SafeAreaView edges={["bottom"]} className="rounded-t-[30px] bg-[#fcfbf8] px-5 pb-6 pt-3">
          <View className="items-center"><View className="h-1.5 w-10 rounded-full bg-[#cfd5de]" /></View>
          <View className="mt-5 flex-row items-center justify-between"><View><Text className="text-[10px] font-bold uppercase tracking-[1.8px] text-[#5d78b6]">Course library</Text><Text className="mt-1 font-serif text-[29px] text-ink">Choose a course</Text></View><CircleButton accessibilityLabel="Close course selector" light onPress={onClose}><Icon name="x" size={20} color="#56647a" /></CircleButton></View>
          <View className="mt-4 border-t border-line">{courses.map((course) => <CourseRow active={activeId === course.id} course={course} key={course.id} onPress={() => onSelect(course)} />)}</View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function TabBar({ active, onChange }) {
  const tabs = [
    { id: "ask", label: "Ask", icon: "message-circle" },
    { id: "library", label: "Library", icon: "book-open" },
    { id: "account", label: "Account", icon: "user" },
  ];
  return (
    <SafeAreaView edges={["bottom"]} className="border-t border-[#243b62] bg-navy">
      <View className="flex-row px-3 pb-1 pt-2">
        {tabs.map((tab) => {
          const selected = active === tab.id;
          return <Pressable className="flex-1 items-center justify-center gap-1 py-2" key={tab.id} onPress={() => onChange(tab.id)}><Icon name={tab.icon} size={18} color={selected ? "#d8e5ff" : "#8296b8"} /><Text className={`text-[10px] font-bold ${selected ? "text-[#d8e5ff]" : "text-[#8296b8]"}`}>{tab.label}</Text></Pressable>;
        })}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  const [tab, setTab] = useState("ask");
  const [courses, setCourses] = useState(initialCourses);
  const [selectedCourseId, setSelectedCourseId] = useState("net");
  const [messages, setMessages] = useState(initialMessages);
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState(previewSources);
  const [resources, setResources] = useState([]);
  const [selectedResourceId, setSelectedResourceId] = useState(null);
  const [account, setAccount] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [focusTopic, setFocusTopic] = useState("");
  const [isAnswering, setIsAnswering] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCourseOpen, setIsCourseOpen] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState("tcp");
  const [authMode, setAuthMode] = useState("register");
  const [authForm, setAuthForm] = useState({ email: "", password: "", firstName: "", lastName: "" });
  const [authError, setAuthError] = useState("");
  const [toast, setToast] = useState("");

  const course = courses.find((item) => item.id === selectedCourseId) ?? courses[0];
  const currentAnswer = [...messages].reverse().find((item) => item.role === "assistant");
  const evidenceSources = (currentAnswer?.citations ?? []).map((id) => sources.find((source) => source.id === id)).filter(Boolean);
  const librarySources = account ? resources.filter((resource) => String(resource.course) === String(course.remoteId ?? workspace?.courseId)) : previewSources;

  const notify = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2800);
  };

  const normalizeCourses = (remoteCourses) => remoteCourses.map((item) => ({
    id: String(item.id),
    remoteId: item.id,
    name: item.title,
    code: item.code,
    color: item.color,
    count: item.documents_count,
  }));

  const hydrateAccount = async (user) => {
    const setup = await provisionWorkspace();
    const [documents, remoteCourses] = await Promise.all([listDocuments(), listCourses()]);
    const mappedCourses = normalizeCourses(remoteCourses);
    setAccount(user);
    setWorkspace({ courseId: setup.course.id, conversationId: setup.conversation.id });
    setCourses(mappedCourses);
    setSelectedCourseId(String(setup.course.id));
    setResources(documents);
    setSelectedResourceId((documents.find((document) => document.course === setup.course.id) ?? {}).id ?? null);
  };

  useEffect(() => {
    let active = true;
    const restore = async () => {
      if (!(await hasSession())) return;
      try {
        const user = await getCurrentUser();
        if (active) await hydrateAccount(user);
      } catch {
        await clearSession();
      }
    };
    restore();
    return () => { active = false; };
  }, []);

  const selectCourse = (nextCourse) => {
    setSelectedCourseId(nextCourse.id);
    setIsCourseOpen(false);
    if (account && nextCourse.remoteId && String(nextCourse.remoteId) !== String(workspace?.courseId)) {
      setWorkspace((current) => ({ ...current, courseId: nextCourse.remoteId, conversationId: null }));
      const matchingResource = resources.find((resource) => String(resource.course) === String(nextCourse.remoteId));
      setSelectedResourceId(matchingResource?.id ?? null);
      setMessages([]);
    }
  };

  const openEvidence = (sourceId) => {
    setSelectedSourceId(sourceId);
    setIsEvidenceOpen(true);
  };

  const selectResource = (resource) => {
    if (account) {
      setSelectedResourceId(resource.id);
      notify(`${resource.title} is selected for answers.`);
    } else {
      notify("Ask a question to see which pages this preview source supports.");
    }
  };

  const openAuth = () => {
    setAuthError("");
    setIsAuthOpen(true);
  };

  const handleAuthentication = async () => {
    setAuthError("");
    try {
      setIsAuthenticating(true);
      const user = await authenticate({ ...authForm, register: authMode === "register" });
      await hydrateAccount(user);
      setIsAuthOpen(false);
      setTab("library");
      notify(`Connected as ${user.display_name}. Add a PDF to start studying.`);
    } catch (error) {
      setAuthError(apiErrorMessage(error));
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleAddSource = async () => {
    if (!account || !workspace) {
      openAuth();
      notify("Sign in first so Acadexa can save this PDF to your course.");
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets?.[0]) return;
      const document = await uploadPdf({ courseId: workspace.courseId, file: result.assets[0] });
      setResources((items) => [document, ...items.filter((item) => item.id !== document.id)]);
      setSelectedResourceId(document.id);
      if (document.status === "failed") {
        notify(document.extraction_error || "Acadexa could not process that PDF.");
        return;
      }
      notify(`${document.original_filename} is saved and ready to answer from.`);
    } catch (error) {
      notify(apiErrorMessage(error));
    }
  };

  const handleSend = async () => {
    const cleaned = query.trim();
    if (!cleaned || isAnswering) return;
    const timestamp = Date.now();
    setMessages((items) => [...items, { id: `question-${timestamp}`, role: "user", text: cleaned }]);
    setQuery("");

    if (!workspace) {
      const answer = answerFromPreview(cleaned);
      setMessages((items) => [...items, { id: `answer-${timestamp}`, role: "assistant", ...answer }]);
      if (answer.citations.length) setSelectedSourceId(answer.citations[0]);
      return;
    }
    if (!selectedResourceId) {
      setMessages((items) => [...items, {
        id: `answer-${timestamp}`,
        role: "assistant",
        text: "Select one uploaded PDF before asking a question, so I can keep the answer tied to that resource.",
        citations: [],
        mode: "insufficient-context",
      }]);
      notify("Select an uploaded PDF to ask from it.");
      return;
    }

    try {
      setIsAnswering(true);
      let conversationId = workspace.conversationId;
      if (!conversationId) {
        const conversation = await createConversation(workspace.courseId);
        conversationId = conversation.id;
        setWorkspace((current) => ({ ...current, conversationId }));
      }
      const answer = await askCourseQuestion(conversationId, cleaned, selectedResourceId, focusTopic);
      const answerSources = (answer.citations ?? []).map(sourceFromCitation);
      setSources((items) => [...answerSources, ...items.filter((item) => !answerSources.some((next) => next.id === item.id))]);
      setMessages((items) => [...items, {
        id: `answer-${answer.id}`,
        role: "assistant",
        text: answer.content,
        citations: answerSources.map((source) => source.id),
        mode: answer.generation_mode,
      }]);
      if (answerSources.length) setSelectedSourceId(answerSources[0].id);
    } catch (error) {
      const message = apiErrorMessage(error);
      setMessages((items) => [...items, { id: `answer-${timestamp}`, role: "assistant", text: message, citations: [], mode: "api-error" }]);
      notify(message);
    } finally {
      setIsAnswering(false);
    }
  };

  const handleNewConversation = async () => {
    setMessages([]);
    setQuery("");
    if (!workspace) {
      notify(`A fresh ${course.name} conversation is ready.`);
      return;
    }
    try {
      const conversation = await createConversation(workspace.courseId);
      setWorkspace((current) => ({ ...current, conversationId: conversation.id }));
      notify(`New conversation started in ${course.name}.`);
    } catch (error) {
      notify(apiErrorMessage(error));
    }
  };

  const handleSignOut = () => {
    Alert.alert("Sign out?", "Your saved PDFs remain in your account.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await clearSession();
          setAccount(null);
          setWorkspace(null);
          setResources([]);
          setCourses(initialCourses);
          setSelectedCourseId("net");
          setSelectedResourceId(null);
          setMessages(initialMessages);
          setSources(previewSources);
          setTab("ask");
          notify("You have been signed out.");
        },
      },
    ]);
  };

  const mainScreen = useMemo(() => {
    if (tab === "library") return <LibraryScreen account={account} course={course} courses={courses} onAddSource={handleAddSource} onSelectCourse={selectCourse} onSelectResource={selectResource} resources={librarySources} selectedResourceId={selectedResourceId} sources={librarySources} />;
    if (tab === "account") return <AccountScreen account={account} onOpenAuth={openAuth} onSignOut={handleSignOut} resources={resources} />;
    return <AskScreen course={course} isAnswering={isAnswering} messages={messages} onAddContext={handleAddSource} onNewConversation={handleNewConversation} onOpenEvidence={openEvidence} onSend={handleSend} onShowCourses={() => setIsCourseOpen(true)} query={query} setQuery={setQuery} sources={sources} />;
  }, [account, course, courses, isAnswering, librarySources, messages, query, resources, selectedResourceId, sources, tab]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView className="flex-1 bg-navy" edges={["top"]}>
        <View className="flex-row items-center justify-between bg-navy px-5 py-3">
          <View className="flex-row items-center gap-2"><BrandMark /><Text className="font-serif text-[24px] font-semibold tracking-tight text-white">acadexa</Text></View>
          {tab !== "ask" && <CircleButton accessibilityLabel="Ask Acadexa" onPress={() => setTab("ask")}><Icon name="message-circle" size={17} color="#d7e3f9" /></CircleButton>}
        </View>
        <View className="flex-1">{mainScreen}</View>
        <TabBar active={tab} onChange={setTab} />
        <Toast message={toast} />
        <EvidenceSheet account={account} focusTopic={focusTopic} notify={notify} onClose={() => setIsEvidenceOpen(false)} onOpenAuth={openAuth} onSelectResource={selectResource} resources={resources} selectedResourceId={selectedResourceId} selectedSourceId={selectedSourceId} setFocusTopic={setFocusTopic} setSelectedSourceId={setSelectedSourceId} sources={evidenceSources} visible={isEvidenceOpen} />
        <AuthSheet error={authError} form={authForm} mode={authMode} onClose={() => setIsAuthOpen(false)} onSubmit={handleAuthentication} setForm={setAuthForm} setMode={setAuthMode} submitting={isAuthenticating} visible={isAuthOpen} />
        <CourseSheet activeId={selectedCourseId} courses={courses} onClose={() => setIsCourseOpen(false)} onSelect={selectCourse} visible={isCourseOpen} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
