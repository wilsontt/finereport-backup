/**
 * 流程進度指示器 (Step Indicator)
 * 
 * 顯示目前備份流程的進度狀態。
 * 包含四個步驟：連線設定、人為驗證、路徑選擇、備份執行。
 * 已完成與進行中的步驟會以主題色 (Primary Color) 高亮顯示。
 */
import React from 'react';

type Step = 'credentials' | 'human' | 'paths' | 'backup';

interface StepIndicatorProps {
  /** 目前所在的步驟狀態 */
  currentStep: Step;
}

/** 步驟定義與顯示名稱 */
const steps: { id: Step; label: string }[] = [
  { id: 'credentials', label: '連線設定' },
  { id: 'human', label: '人為驗證' },
  { id: 'paths', label: '路徑選擇' },
  { id: 'backup', label: '備份執行' },
];

export const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  // 找出目前步驟的索引，用於判斷其他步驟是「已完成(isPast)」或「進行中(isActive)」
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', margin: '2rem 0', width: '100%' }}>
      {steps.map((step, index) => {
        const isActive = index === currentIndex;
        const isPast = index < currentIndex;
        
        return (
          <React.Fragment key={step.id}>
            {/* 步驟圓圈與文字 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1 }}>
              {/* 圓圈：顯示步驟數字，依狀態切換背景色與邊框 */}
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: isActive || isPast ? 'var(--color-primary)' : '#f3f4f6',
                  color: isActive || isPast ? '#ffffff' : '#9ca3af',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '1.125rem',
                  border: isActive || isPast ? '2px solid var(--color-primary)' : '2px solid #e5e7eb',
                  transition: 'all 0.3s ease',
                }}
              >
                {index + 1}
              </div>
              {/* 步驟名稱：顯示在圓圈下方，依狀態切換文字顏色與粗細 */}
              <div
                style={{
                  marginTop: '0.5rem',
                  fontSize: '0.875rem',
                  color: isActive || isPast ? 'var(--color-primary)' : '#9ca3af',
                  fontWeight: isActive ? 'bold' : 'normal',
                  position: 'absolute',
                  top: '45px',
                  whiteSpace: 'nowrap',
                }}
              >
                {step.label}
              </div>
            </div>

            {/* 步驟之間的連接線：最後一個步驟後不顯示。透過 margin-top 置中對齊圓圈 */}
            {index < steps.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: '2px',
                  backgroundColor: isPast ? 'var(--color-primary)' : '#e5e7eb',
                  margin: '19px 10px 0',
                  maxWidth: '80px',
                  transition: 'all 0.3s ease',
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
