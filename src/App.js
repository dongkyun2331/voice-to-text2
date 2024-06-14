import React, { useState, useEffect } from "react";

// 메인 App 컴포넌트 정의
const App = () => {
  // 음성 인식 상태와 텍스트 결과를 저장할 state 설정
  const [isListening, setIsListening] = useState(false);
  const [text, setText] = useState("");
  const [recognition, setRecognition] = useState(null);

  // 컴포넌트가 처음 렌더링될 때 실행되는 useEffect 훅
  useEffect(() => {
    // 브라우저에서 제공하는 SpeechRecognition API 가져오기
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    // SpeechRecognition이 브라우저에서 지원되는지 확인
    if (SpeechRecognition) {
      // SpeechRecognition 인스턴스 생성
      const recog = new SpeechRecognition();
      recog.continuous = true; // 연속 인식 설정
      recog.interimResults = true; // 중간 결과도 반환
      recog.lang = "ko-KR"; // 한국어로 설정

      // 음성 인식 결과 이벤트 처리
      recog.onresult = (event) => {
        let interimTranscript = ""; // 중간 결과 저장 변수
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript; // 인식된 텍스트
          if (event.results[i].isFinal) {
            // 최종 결과인 경우
            setText((prevText) => prevText + transcript); // 최종 결과를 text state에 추가
          } else {
            // 중간 결과인 경우
            interimTranscript += transcript; // 중간 결과를 interimTranscript에 추가
          }
        }
        setText((prevText) => prevText + interimTranscript); // 중간 결과를 text state에 추가
      };

      // 음성 인식이 종료되었을 때 이벤트 처리
      recog.onend = () => {
        if (isListening) {
          // 음성 인식을 계속 듣고 있는 상태라면 재시작
          recog.start();
        }
      };

      setRecognition(recog); // recognition state에 인스턴스 저장
    } else {
      // SpeechRecognition을 지원하지 않는 브라우저에 대한 안내
      alert("이 브라우저는 음성 인식을 지원하지 않습니다.");
    }
  }, [isListening]);

  // 음성 인식 시작/중지 핸들러
  const handleListen = () => {
    if (recognition) {
      if (isListening) {
        recognition.stop(); // 듣고 있는 상태라면 중지
      } else {
        recognition.start(); // 듣고 있지 않은 상태라면 시작
      }
      setIsListening(!isListening); // isListening 상태를 토글
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>음성을 텍스트로 변환</h1>
      <button onClick={handleListen}>{isListening ? "중지" : "시작"}</button>
      <p>{text}</p>
    </div>
  );
};

export default App;
