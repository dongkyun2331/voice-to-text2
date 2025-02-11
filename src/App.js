// App.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
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

// speakerId(혹은 svrname)를 기반으로 고유한 색상을 생성하는 함수
const hashStringToColor = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xff;
    color += ('00' + value.toString(16)).slice(-2);
  }
  return color;
};

const App = () => {
  // localStorage svrname 관련 상태
  const [svrname, setSvrname] = useState(localStorage.getItem('svrname') || '');
  const [svrnameInput, setSvrnameInput] = useState(svrname);

  // 음성 인식 및 텍스트 데이터 관련 상태
  const [isListening, setIsListening] = useState(false);
  const [textData, setTextData] = useState([]); // [{ text, speaker, color }, ...]
  const [interimMessages, setInterimMessages] = useState({}); // { speaker: { interimText, color } }
  const [recognition, setRecognition] = useState(null);
  const [logs, setLogs] = useState([]);

  // 스피커 정보: svrname를 speakerId로 사용하고, hashStringToColor로 color를 결정
  const [speakerId, setSpeakerId] = useState('');
  const [color, setColor] = useState('');

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

  const addLog = (message) => {
    setLogs((prevLogs) => [...prevLogs, message]);
  };

  const fetchTextFromServer = useCallback(async () => {
    try {
      addLog('Fetching text from server');
      const result = await axios.get(`${http}://${ipAddress}:${port}/get-text`);
      addLog('Fetched text data');
      setTextData(result.data.textData || []);
      setInterimMessages(result.data.interimMessages || {});
    } catch (error) {
      addLog(`Error fetching text: ${error}`);
      console.error('Error fetching text:', error);
    }
  }, []);

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
          });
        }
        // 중간 텍스트 전송 (이전 텍스트는 덮어쓰기)
        await axios.post(`${http}://${ipAddress}:${port}/save-interim-text`, {
          interimText: interimTranscript,
          speaker: speakerId,
          color: color,
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
  }, [speakerId, color]);

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
    fetchTextFromServer();
  }, [fetchTextFromServer]);

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

  return (
    <Router>
      <div
        style={{
          textAlign: 'center',
          marginTop: '50px',
          backgroundColor: 'transparent',
        }}
      >
        <button onClick={handleListen} className="ats-start">
          {isListening ? '중지' : '시작'}
        </button>
        <div
          style={{
            position: 'fixed',
            bottom: '42px',
            textAlign: 'left',
            padding: '10px',
            maxHeight: '30vh',
            overflowY: 'auto',
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
                color: interimMessages[speaker].color || 'blue',
                fontStyle: 'italic',
                margin: 0,
              }}
            >
              {interimMessages[speaker].interimText}
            </p>
          ))}
          <div ref={textDataEndRef} />
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
                    저장
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
