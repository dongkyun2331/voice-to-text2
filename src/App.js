// App.jsx
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import axios from 'axios';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import io from 'socket.io-client';
import config from './config'; // { port: 3000, http: 'http', ipAddress: 'localhost' }

// (예시) config.json을 동적으로 불러오는 함수
const loadConfig = async () => {
  try {
    const response = await axios.get('/config.json');
    return response.data;
  } catch (error) {
    console.error('Error loading config:', error);
    return null;
  }
};

const { port, http } = config;
let ipAddress = 'localhost'; // 기본값

// 실제 config.json 불러오기
const configData = await loadConfig();
if (configData && configData.ipAddress) {
  ipAddress = configData.ipAddress;
}

// 소켓 연결
const socket = io(`${http}://${ipAddress}:${port}`);

// 전역 변수(혹은 모듈 전역)에 할당된 색상들 저장
const assignedSpeakerColors = {};
const fixedColors = ['skyblue', '#FFFF00', '#00FFFF'];

// speakerId를 기반으로 색상 생성/할당
const hashStringToColor = (str) => {
  // 'svrid'가 특정 값인 경우 흰색 (예시 로직)
  if (localStorage.getItem('svrid') === 'u01@ezpt.kr') return '#fff';

  if (assignedSpeakerColors[str]) return assignedSpeakerColors[str];

  const usedColors = new Set(Object.values(assignedSpeakerColors));
  const available = fixedColors.find((color) => !usedColors.has(color));
  const newColor = available || fixedColors[0];
  assignedSpeakerColors[str] = newColor;
  return newColor;
};

const App = () => {
  // localStorage에서 svrname, svrgrp 읽어오기
  const [svrname, setSvrname] = useState(
    localStorage.getItem('svrname') || 'unknown'
  );
  // 화면에 표시될 닉네임 input
  const [svrnameInput, setSvrnameInput] = useState(svrname);

  const [svrgrp, setSvrgrp] = useState(
    localStorage.getItem('svrgrp') || '334823'
  );
  const [svrgrpInput, setSvrgrpInput] = useState(svrgrp);

  const [isListening, setIsListening] = useState(false);
  const [textData, setTextData] = useState([]); // [{ text, speaker, color }, ...]
  const [interimMessages, setInterimMessages] = useState({});
  const [recognition, setRecognition] = useState(null);
  const [logs, setLogs] = useState([]);

  const [speakerId, setSpeakerId] = useState('');
  const [color, setColor] = useState('');
  const [fontSize, setFontSize] = useState(16);

  // 참석자 목록 클릭 시 버튼을 표시할지 여부
  const [showAttendeeControls, setShowAttendeeControls] = useState(false);

  // 닉네임 모달(팝업) 열림 상태
  const [showNicknameModal, setShowNicknameModal] = useState(
    !svrname || svrname === 'unknown'
  );

  // 5초 뒤 자동 저장 타이머를 관리할 ref
  const autoSaveTimerRef = useRef(null);

  const logsEndRef = useRef(null);
  const textDataEndRef = useRef(null);
  const isListeningRef = useRef(isListening);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // 소켓: 방 입장
  useEffect(() => {
    socket.emit('join', { svrgrp, svrname });
  }, [svrgrp, svrname]);

  // 서버가 "assignName" 보낼 때 → svrnameInput에 표시하고, 5초 후 자동 저장
  useEffect(() => {
    socket.on('assignName', (assignedName) => {
      console.log('서버에서 할당된 닉네임:', assignedName);
      setSvrnameInput(assignedName);

      // 닉네임 모달이 안 떠 있으면 띄우기 (자동 할당된 닉네임을 보여주기 위해)
      setShowNicknameModal(true);

      // 기존 타이머가 있으면 지우고 다시 설정
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      // 5초 후 자동으로 localStorage & state에 반영 + 모달 닫기
      autoSaveTimerRef.current = setTimeout(() => {
        localStorage.setItem('svrname', assignedName);
        setSvrname(assignedName);
        setShowNicknameModal(false);
      }, 5000);
    });

    return () => {
      socket.off('assignName');
    };
  }, []);

  // svrname 바뀔 때 색상과 speakerId 설정
  useEffect(() => {
    if (svrname) {
      setSpeakerId(svrname);
      const newColor = hashStringToColor(svrname);
      setColor(newColor);
    }
  }, [svrname]);

  // Socket.io: initial-text, new-text, new-interim-text
  useEffect(() => {
    socket.on('initial-text', (data) => {
      setTextData(data.textData || []);
      setInterimMessages(data.interimMessages || {});
    });
    socket.on('new-text', (message) => {
      setTextData((prev) => [...prev, message]);
    });
    socket.on('new-interim-text', ({ speaker, interimText, color }) => {
      setInterimMessages((prev) => ({
        ...prev,
        [speaker]: { interimText, color },
      }));
    });
    return () => {
      socket.off('initial-text');
      socket.off('new-text');
      socket.off('new-interim-text');
    };
  }, []);

  // 음성 인식 객체 생성
  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const recog = new window.webkitSpeechRecognition();
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = 'ko-KR';

      recog.onresult = async (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        // 최종 텍스트
        if (finalTranscript.trim() !== '') {
          addLog(`Saving text to server: ${finalTranscript}`);
          await axios.post(`${http}://${ipAddress}:${port}/save-text`, {
            text: finalTranscript,
            speaker: speakerId,
            color: color,
            svrgrp: svrgrp,
          });
        }
        // 중간 텍스트
        await axios.post(`${http}://${ipAddress}:${port}/save-interim-text`, {
          interimText: interimTranscript,
          speaker: speakerId,
          color: color,
          svrgrp: svrgrp,
        });
      };

      recog.onend = () => {
        if (isListeningRef.current) {
          addLog('Recognition ended unexpectedly, restarting...');
          recog.start();
        }
      };

      setRecognition(recog);
    } else {
      alert('이 브라우저는 음성 인식을 지원하지 않습니다.');
    }
  }, [speakerId, color, svrgrp]);

  // 서버에서 텍스트 데이터 가져오기
  const addLog = (msg) => setLogs((prev) => [...prev, msg]);
  const fetchTextFromServer = useCallback(async () => {
    try {
      addLog('Fetching text from server');
      const result = await axios.get(
        `${http}://${ipAddress}:${port}/get-text`,
        {
          params: { svrgrp },
        }
      );
      addLog('Fetched text data');
      setTextData(result.data.textData || []);
      setInterimMessages(result.data.interimMessages || {});
    } catch (error) {
      addLog(`Error fetching text: ${error}`);
    }
  }, [svrgrp]);

  useEffect(() => {
    if (svrgrp) {
      fetchTextFromServer();
    }
  }, [fetchTextFromServer, svrgrp]);

  // 음성인식 시작/중지
  const handleListen = () => {
    if (recognition) {
      if (isListening) {
        addLog('Stopping recognition');
        recognition.stop();
      } else {
        addLog('Starting recognition');
        recognition.start();
      }
      setIsListening(!isListening);
    }
  };

  // 로그 스크롤
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // 텍스트창 스크롤
  useEffect(() => {
    if (textDataEndRef.current) {
      textDataEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [textData, interimMessages]);

  // 참석자 목록
  const attendingSpeakers = useMemo(() => {
    const speakersSet = new Set();
    textData.forEach((msg) => speakersSet.add(msg.speaker));
    Object.keys(interimMessages).forEach((sp) => speakersSet.add(sp));
    if (svrname) speakersSet.add(svrname);
    return Array.from(speakersSet);
  }, [textData, interimMessages, svrname]);

  // PDF 저장
  const handleSavePDF = async () => {
    if (!svrname) {
      addLog('svrname이 설정되지 않았습니다.');
      return;
    }
    try {
      addLog('PDF 저장 시도 중...');
      await axios.post(`${http}://${ipAddress}:${port}/save-pdf`, {
        svrname,
        svrgrp,
      });
      addLog('PDF가 성공적으로 저장되었습니다.');
    } catch (error) {
      addLog(`PDF 저장 오류: ${error}`);
    }
  };

  // 폰트 크기 조절
  const increaseFontSize = () => setFontSize((prev) => prev + 2);
  const decreaseFontSize = () => setFontSize((prev) => Math.max(2, prev - 2));

  // 닉네임 모달에서 "수동 저장" 버튼 (원한다면 사용자에게 직접 저장 시키는 로직)
  // 지금 요구사항은 "5초 뒤 자동 저장"이므로, 여유로 남겨 둠
  const handleManualNicknameSave = () => {
    localStorage.setItem('svrname', svrnameInput);
    setSvrname(svrnameInput);
    setShowNicknameModal(false);
    // 5초 타이머가 동작 중이면 해제
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  };

  return (
    <Router>
      <div
        style={{
          textAlign: 'center',
          marginTop: '50px',
          backgroundColor: 'transparent',
          position: 'relative',
          minHeight: '100vh',
        }}
      >
        {/* PDF 저장 버튼 */}
        <button onClick={handleSavePDF} className="ats-save-pdf">
          PDF 저장
        </button>

        {/* 닉네임 모달(팝업) */}
        {showNicknameModal && (
          <div
            style={{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%,-50%)',
              zIndex: 1000,
              border: '1px solid #ccc',
              backgroundColor: '#fff',
            }}
            className="ats-nickname"
          >
            <div
              style={{
                backgroundColor: '#2196F3',
                color: '#fff',
                padding: '10px',
                textAlign: 'left',
              }}
            >
              닉네임 설정
            </div>
            <div style={{ padding: '10px' }}>
              <input
                type="text"
                value={svrnameInput}
                onChange={(e) => setSvrnameInput(e.target.value)}
                placeholder="닉네임"
                style={{ padding: '8px', fontSize: '16px' }}
              />
              <p style={{ fontSize: '14px', color: '#666' }}>
                (5초 후 자동 저장 예정)
              </p>
              {/* 만약 "직접 저장" 버튼을 두고 싶다면: */}
              {/* 
              <button
                onClick={handleManualNicknameSave}
                style={{
                  padding: '8px 12px',
                  marginLeft: '10px',
                  fontSize: '16px',
                  backgroundColor: '#3b75ac',
                  color: '#fff',
                  border: 'none',
                }}
              >
                수동 저장
              </button>
              */}
            </div>
          </div>
        )}

        {/* 메모(채팅) 박스 */}
        <div
          style={{
            position: 'fixed',
            bottom: '42px',
            textAlign: 'left',
            padding: '10px 10px 10px 165px',
            height: '6em',
            overflowY: 'auto',
            backgroundColor: 'rgba(0,0,0,0.8)',
            width: '100%',
            fontSize: `${fontSize}px`,
          }}
          className="memo-box"
        >
          {textData.map((msg, index) => (
            <span key={index} style={{ color: msg.color || '#fff', margin: 0 }}>
              {msg.text}
            </span>
          ))}
          {Object.keys(interimMessages).map((speaker) => (
            <span
              key={speaker}
              style={{
                color:
                  interimMessages[speaker].color || hashStringToColor(speaker),
                fontStyle: 'italic',
                margin: 0,
              }}
            >
              {interimMessages[speaker].interimText}{' '}
            </span>
          ))}
          <div ref={textDataEndRef} />
        </div>

        {/* 참석자 목록 영역 */}
        <div
          style={{
            position: 'fixed',
            bottom: '42px',
            left: '0px',
            textAlign: 'left',
            padding: '10px',
            height: '6em',
            minWidth: '155px',
          }}
          className="attendee-list"
          onClick={() => setShowAttendeeControls(!showAttendeeControls)}
        >
          <div
            style={{
              overflowY: 'auto',
              height: showAttendeeControls ? 'calc(100% - 50px)' : '100%',
            }}
          >
            {attendingSpeakers.map((speaker) => (
              <p
                key={speaker}
                style={{ color: hashStringToColor(speaker), margin: 0 }}
              >
                {speaker}
              </p>
            ))}
          </div>

          {showAttendeeControls && (
            <div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  decreaseFontSize();
                }}
                style={{
                  padding: '2px',
                  background: 'none',
                  color: '#fff',
                  fontWeight: 'bold',
                  borderRadius: '50%',
                  fontSize: '40px',
                  border: 'none',
                }}
              >
                -
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleListen();
                }}
                className="ats-start"
                style={{
                  background: '#fff',
                  padding: '2px',
                  margin: '0 20px',
                  borderRadius: '50%',
                }}
              >
                {isListening ? (
                  <img
                    src="/images/audio-on.png"
                    style={{ width: '30px' }}
                    alt="Audio on"
                  />
                ) : (
                  <img
                    src="/images/audiounmute.png"
                    style={{ width: '30px' }}
                    alt="Audio off"
                  />
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  increaseFontSize();
                }}
                style={{
                  padding: '2px',
                  background: 'none',
                  color: '#fff',
                  fontWeight: 'bold',
                  borderRadius: '50%',
                  fontSize: '40px',
                  border: 'none',
                }}
              >
                +
              </button>
            </div>
          )}
        </div>

        {/* 라우터 설정 (예: /debug에서 로그 확인) */}
        <Routes>
          <Route
            path="/debug"
            element={
              <div
                style={{
                  textAlign: 'left',
                  marginTop: '20px',
                  maxHeight: '200px',
                  overflowY: 'scroll',
                  backgroundColor: '#f0f0f0',
                  padding: '10px',
                }}
              >
                <h2>Logs</h2>
                {logs.map((log, index) => (
                  <p key={index}>{log}</p>
                ))}
                <div ref={logsEndRef} />
                <div style={{ textAlign: 'center', marginTop: '50px' }}>
                  {/* svrname 수동 수정 */}
                  <input
                    type="text"
                    value={svrnameInput}
                    onChange={(e) => setSvrnameInput(e.target.value)}
                    placeholder="svrname"
                    style={{ padding: '8px', fontSize: '16px' }}
                  />
                  <button
                    onClick={() => {
                      localStorage.setItem('svrname', svrnameInput);
                      setSvrname(svrnameInput);
                    }}
                    style={{
                      padding: '8px 12px',
                      marginLeft: '10px',
                      fontSize: '16px',
                    }}
                  >
                    svrname 저장
                  </button>
                  {/* svrgrp 수동 수정 */}
                  <input
                    type="text"
                    value={svrgrpInput}
                    onChange={(e) => setSvrgrpInput(e.target.value)}
                    placeholder="svrgrp"
                    style={{
                      padding: '8px',
                      fontSize: '16px',
                      marginLeft: '10px',
                    }}
                  />
                  <button
                    onClick={() => {
                      localStorage.setItem('svrgrp', svrgrpInput);
                      setSvrgrp(svrgrpInput);
                    }}
                    style={{
                      padding: '8px 12px',
                      marginLeft: '10px',
                      fontSize: '16px',
                    }}
                  >
                    svrgrp 저장
                  </button>
                </div>
              </div>
            }
          />
          <Route path="/" element={<div />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
