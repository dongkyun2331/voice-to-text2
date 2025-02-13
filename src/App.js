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
import config from './config'; // 예: { port: 3000, http: 'http' }

const loadConfig = async () => {
  try {
    const response = await axios.get('/config.json');
    return response.data;
  } catch (error) {
    console.error('Error loading config:', error);
    return null;
  }
};

const { ipAddress } = await loadConfig();
const { port, http } = config;
const socket = io(`${http}://${ipAddress}:${port}`);

// 전역 변수로 이미 할당된 스피커 색상 저장 (재할당 방지)
const assignedSpeakerColors = {};
const fixedColors = ['skyblue', '#FFFF00', '#00FFFF'];

// speakerId(혹은 svrname)를 기반으로 색상을 생성/할당하는 함수
const hashStringToColor = (str) => {
  // 로컬스토리지 svrname (혹은 svrname)이 '참석01'인 경우는 흰색 반환
  if (str === '참석01') return '#fff';

  // 이미 할당된 색상이 있으면 그대로 반환
  if (assignedSpeakerColors[str]) return assignedSpeakerColors[str];

  // 아직 할당되지 않았다면 fixedColors 배열에서 아직 사용되지 않은 색상을 선택
  const usedColors = new Set(Object.values(assignedSpeakerColors));
  const available = fixedColors.find((color) => !usedColors.has(color));
  // 만약 모든 색상이 사용 중이면 (예외적으로) 첫번째 색상을 사용하도록 함
  const newColor = available || fixedColors[0];
  assignedSpeakerColors[str] = newColor;
  return newColor;
};

const App = () => {
  // localStorage svrname, svrgrp 관련 상태
  const [svrname, setSvrname] = useState(localStorage.getItem('svrname') || '');
  const [svrnameInput, setSvrnameInput] = useState(svrname);

  const [svrgrp, setSvrgrp] = useState(localStorage.getItem('svrgrp') || '');
  const [svrgrpInput, setSvrgrpInput] = useState(svrgrp);

  // 음성 인식 및 텍스트 데이터 관련 상태
  const [isListening, setIsListening] = useState(false);
  const [textData, setTextData] = useState([]); // [{ text, speaker, color }, ...]
  const [interimMessages, setInterimMessages] = useState({}); // { speaker: { interimText, color } }
  const [recognition, setRecognition] = useState(null);
  const [logs, setLogs] = useState([]);

  // 현재 스피커 정보: svrname를 speakerId로 사용하고, hashStringToColor로 color 결정
  const [speakerId, setSpeakerId] = useState('');
  const [color, setColor] = useState('');
  const [fontSize, setFontSize] = useState(16);

  const logsEndRef = useRef(null);
  const textDataEndRef = useRef(null);

  // 최신 isListening 상태 참조 (onend 클로저 문제 해결용)
  const isListeningRef = useRef(isListening);
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // svrname이 있으면 speakerId와 color를 초기화 (마운트 시 또는 svrname이 변경될 때)
  useEffect(() => {
    if (svrname) {
      setSpeakerId(svrname);
      const newColor = hashStringToColor(svrname);
      setColor(newColor);
      console.log('Initialized speaker:', svrname, 'with color:', newColor);
    }
  }, [svrname]);

  // svrgrp가 설정되면 socket.io 방에 입장
  useEffect(() => {
    if (svrgrp) {
      socket.emit('join', svrgrp);
    }
  }, [svrgrp]);

  const addLog = (message) => {
    setLogs((prevLogs) => [...prevLogs, message]);
  };

  // svrgrp 값을 query 파라미터로 포함하여 서버의 텍스트 데이터를 가져옴
  const fetchTextFromServer = useCallback(async () => {
    try {
      addLog('Fetching text from server');
      const result = await axios.get(
        `${http}://${ipAddress}:${port}/get-text`,
        { params: { svrgrp } }
      );
      addLog('Fetched text data');
      setTextData(result.data.textData || []);
      setInterimMessages(result.data.interimMessages || {});
    } catch (error) {
      addLog(`Error fetching text: ${error}`);
      console.error('Error fetching text:', error);
    }
  }, [svrgrp]);

  // Socket.io 이벤트 처리
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
        // 최종 텍스트가 있다면 서버에 전송 (현재 스피커의 메시지로 추가)
        if (finalTranscript.trim() !== '') {
          addLog(`Saving text to server: ${finalTranscript}`);
          await axios.post(`${http}://${ipAddress}:${port}/save-text`, {
            text: finalTranscript,
            speaker: speakerId,
            color: color,
            svrgrp: svrgrp, // 그룹 정보 포함
          });
        }
        // 중간 텍스트 전송 (이전 텍스트는 덮어쓰기)
        await axios.post(`${http}://${ipAddress}:${port}/save-interim-text`, {
          interimText: interimTranscript,
          speaker: speakerId,
          color: color,
          svrgrp: svrgrp, // 그룹 정보 포함
        });
      };

      recog.onend = async () => {
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

  // "시작" 버튼 클릭: 음성 인식 시작/중지 처리
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

  useEffect(() => {
    if (svrgrp) fetchTextFromServer();
  }, [fetchTextFromServer, svrgrp]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  useEffect(() => {
    if (textDataEndRef.current) {
      textDataEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [textData, interimMessages]);

  // 참석한 스피커 목록: textData와 interimMessages의 speaker 필드 결합 (중복 제거)
  const attendingSpeakers = useMemo(() => {
    const speakersSet = new Set();
    textData.forEach((msg) => speakersSet.add(msg.speaker));
    Object.keys(interimMessages).forEach((sp) => speakersSet.add(sp));
    if (svrname) speakersSet.add(svrname); // 현재 사용자 포함
    return Array.from(speakersSet);
  }, [textData, interimMessages, svrname]);

  // ★ PDF 저장 버튼 클릭 시 호출되는 함수
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
      console.error(error);
    }
  };

  // 폰트 크기 증가 함수
  const increaseFontSize = () => {
    setFontSize((prevSize) => prevSize + 2);
  };

  // 폰트 크기 감소 함수
  const decreaseFontSize = () => {
    setFontSize((prevSize) => prevSize - 2);
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
        <button onClick={handleSavePDF} className="ats-save-pdf">
          PDF 저장
        </button>
        <div
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%,-50%)',
          }}
          className="ats-nickname"
        >
          <input
            type="text"
            value={svrnameInput}
            onChange={(e) => setSvrnameInput(e.target.value)}
            placeholder="닉네임"
            style={{ padding: '8px', fontSize: '16px' }}
          />
          <button
            onClick={() => {
              localStorage.setItem('svrname', svrnameInput);
              setSvrname(svrnameInput);
              document.querySelector('.ats-nickname').style.display = 'none';
            }}
            style={{
              padding: '8px 12px',
              marginLeft: '10px',
              fontSize: '16px',
              backgroundColor: '#3b75ac',
              color: '#fff',
              border: 'none',
            }}
          >
            저장
          </button>
        </div>

        {/* memo-box (채팅/메모 영역) */}
        <div
          style={{
            position: 'fixed',
            bottom: '42px',
            textAlign: 'left',
            padding: '10px 10px 10px 100px',
            height: '6em',
            overflowY: 'auto',
            backgroundColor: 'rgba(0,0,0,0.8)',
            fontSize: `${fontSize}px`,
          }}
          className="memo-box"
        >
          {textData.map((msg, index) => (
            <p key={index} style={{ color: msg.color || 'blue', margin: 0 }}>
              {msg.text}
            </p>
          ))}
          {Object.keys(interimMessages).map((speaker) => (
            <p
              key={speaker}
              style={{
                color:
                  interimMessages[speaker].color || hashStringToColor(speaker),
                fontStyle: 'italic',
                margin: 0,
              }}
            >
              {interimMessages[speaker].interimText}
            </p>
          ))}
          <div ref={textDataEndRef} />
        </div>

        {/* 왼쪽에 참석한 svrname 목록 패널 (memo-box와 동일한 높이) */}
        <div
          style={{
            position: 'fixed',
            bottom: '42px',
            left: '0px',
            textAlign: 'left',
            padding: '10px',
            height: '6em',
            overflowY: 'auto',
          }}
          className="attendee-list"
        >
          {attendingSpeakers.map((speaker) => (
            <p
              key={speaker}
              style={{ color: hashStringToColor(speaker), margin: 0 }}
            >
              {speaker}
            </p>
          ))}
          <div style={{ position: 'absolute', bottom: '0' }}>
            <button
              onClick={decreaseFontSize}
              style={{
                padding: '2px',
                background: 'none',
                color: '#fff',
                fontWeight: 'bold',
                borderRadius: '50%',
                fontSize: '20px',
                border: 'none',
              }}
            >
              -
            </button>
            <button
              onClick={handleListen}
              className="ats-start"
              style={{
                background: '#fff',
                padding: '2px',
                borderRadius: '50%',
              }}
            >
              {isListening ? (
                <img
                  src="/images/audio-on.png"
                  style={{ width: '16px' }}
                  alt="Audio on"
                />
              ) : (
                <img
                  src="/images/audiounmute.png"
                  style={{ width: '16px' }}
                  alt="Audio off"
                />
              )}
            </button>
            <button
              onClick={increaseFontSize}
              style={{
                padding: '2px',
                background: 'none',
                color: '#fff',
                fontWeight: 'bold',
                borderRadius: '50%',
                fontSize: '20px',
                border: 'none',
              }}
            >
              +
            </button>
          </div>
        </div>

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
                  {/* svrname 설정 */}
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
                  {/* svrgrp 설정 */}
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
          <Route path="/" element={<div></div>} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
