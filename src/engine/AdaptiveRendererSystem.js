/**
 * Adaptive Renderer System - Extreme Optimization
 * ปรับการตั้งค่า Renderer อัตโนมัติตามประสิทธิภาพของอุปกรณ์
 */

import * as THREE from 'three';

export class AdaptiveRendererSystem {
  constructor(renderer, camera, scene) {
    this.renderer = renderer;
    this.camera = camera;
    this.scene = scene;
    
    // Performance Metrics
    this.fps = 60;
    this.frameTime = 0;
    this.frameCount = 0;
    this.lastTime = performance.now();
    
    // Quality Levels
    this.qualityLevel = 'high'; // high, medium, low, ultra-low
    this.pixelRatio = window.devicePixelRatio;
    this.shadowMapSize = 1024;
    this.shadowQuality = 'pcf'; // pcf, basic, none
    this.antialiasing = true;
    this.postProcessing = true;
    this.particleQuality = 1.0; // 0.0 - 1.0
    
    // Thresholds
    this.fpsThresholds = {
      high: 55,
      medium: 45,
      low: 30,
      ultraLow: 20,
    };
    
    this.init();
  }

  init() {
    // ตรวจจับประเภทอุปกรณ์
    this.detectDeviceType();
    
    // ตั้งค่า Renderer เบื้องต้น
    this.configureRenderer();
    
    // เริ่มการตรวจสอบประสิทธิภาพ
    this.startPerformanceMonitoring();
  }

  /**
   * ตรวจจับประเภทอุปกรณ์
   */
  detectDeviceType() {
    const ua = navigator.userAgent;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const cores = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory || 8;
    
    this.deviceType = {
      isMobile,
      cores,
      memory,
      isLowEnd: isMobile && (cores <= 2 || memory <= 2),
      isMidRange: isMobile && cores >= 4 && memory >= 4,
      isHighEnd: !isMobile || (cores >= 8 && memory >= 8),
    };
    
    console.log('📱 Device Type:', this.deviceType);
    
    // ตั้งค่าคุณภาพเบื้องต้นตามประเภทอุปกรณ์
    if (this.deviceType.isLowEnd) {
      this.qualityLevel = 'ultra-low';
      this.pixelRatio = 0.75; // Set minimum pixel ratio to 0.75 for better visual quality
    } else if (this.deviceType.isMidRange) {
      this.qualityLevel = 'medium';
      this.pixelRatio = 0.75;
    } else {
      this.qualityLevel = 'high';
      this.pixelRatio = Math.max(Math.min(window.devicePixelRatio, 2), 0.75); // Ensure pixel ratio is at least 0.75
    }
  }

  /**
   * ตั้งค่า Renderer
   */
  configureRenderer() {
    // ปิด Antialiasing บนอุปกรณ์สเปคต่ำ
    if (this.deviceType.isLowEnd) {
      this.renderer.antialias = false;
      this.antialiasing = false;
    }
    
    // ตั้งค่า Pixel Ratio
    this.renderer.setPixelRatio(this.pixelRatio);
    
    // ตั้งค่า Power Preference
    this.renderer.getContext().getExtension('WEBGL_lose_context');
    
    // ปิด Shadow Map บนอุปกรณ์สเปคต่ำ
    if (this.qualityLevel === 'ultra-low') {
      this.renderer.shadowMap.enabled = false;
      this.shadowQuality = 'none';
    } else if (this.qualityLevel === 'low') {
      this.renderer.shadowMap.type = THREE.BasicShadowMap;
      this.shadowQuality = 'basic';
    } else {
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.shadowQuality = 'pcf';
    }
    
    // ตั้งค่า Precision สำหรับ Shader
    this.renderer.precision = this.deviceType.isLowEnd ? 'lowp' : 'mediump';
    
    console.log(`✅ Renderer configured for ${this.qualityLevel} quality`);
  }

  /**
   * เริ่มการตรวจสอบประสิทธิภาพ
   */
  startPerformanceMonitoring() {
    this.performanceInterval = setInterval(() => {
      this.updatePerformanceMetrics();
      this.adaptQualityBasedOnPerformance();
    }, 1000); // ตรวจสอบทุก 1 วินาที
  }

  /**
   * อัปเดต Metrics ประสิทธิภาพ
   */
  updatePerformanceMetrics() {
    const now = performance.now();
    const deltaTime = now - this.lastTime;
    
    if (deltaTime > 0) {
      // Calculate FPS over a longer period for stability
      this.frameCount++;
      if (this.frameCount >= 60) { // Average over 60 frames
        this.fps = Math.round(60000 / (performance.now() - this.lastTime));
        this.lastTime = performance.now();
        this.frameCount = 0;
      } else {
        this.fps = Math.round(1000 / deltaTime);
      }
      this.frameTime = deltaTime;
    }
    
    this.lastTime = now;
    
    console.log(`📊 FPS: ${this.fps}, Frame Time: ${this.frameTime.toFixed(2)}ms`);
  }

  /**
   * ปรับคุณภาพตามประสิทธิภาพ
   */
  adaptQualityBasedOnPerformance() {
    const previousQuality = this.qualityLevel;
    
    if (this.fps < this.fpsThresholds.ultraLow) {
      this.qualityLevel = 'ultra-low';
    } else if (this.fps < this.fpsThresholds.low) {
      this.qualityLevel = 'low';
    } else if (this.fps < this.fpsThresholds.medium) {
      this.qualityLevel = 'medium';
    } else if (this.fps >= this.fpsThresholds.high) {
      this.qualityLevel = 'high';
    }
    
    // ถ้าคุณภาพเปลี่ยน ให้ปรับการตั้งค่า
    if (previousQuality !== this.qualityLevel) {
      this.applyQualitySettings();
      console.log(`🔄 Quality changed: ${previousQuality} → ${this.qualityLevel}`);
    }
  }

  /**
   * ใช้การตั้งค่าคุณภาพ
   */
  applyQualitySettings() {
    switch (this.qualityLevel) {
      case 'ultra-low':
        this.pixelRatio = 0.75; // Set minimum pixel ratio to 0.75 for better visual quality
        this.shadowMapSize = 256;
        this.shadowQuality = 'none';
        this.antialiasing = false;
        this.postProcessing = false;
        this.particleQuality = 0.3;
        this.renderer.shadowMap.enabled = false;
        break;
        
      case 'low':
        this.pixelRatio = 0.75;
        this.shadowMapSize = 512;
        this.shadowQuality = 'basic';
        this.antialiasing = false;
        this.postProcessing = false;
        this.particleQuality = 0.5;
        this.renderer.shadowMap.type = THREE.BasicShadowMap;
        this.renderer.shadowMap.enabled = true;
        break;
        
      case 'medium':
        this.pixelRatio = 1.0;
        this.shadowMapSize = 1024;
        this.shadowQuality = 'pcf';
        this.antialiasing = false;
        this.postProcessing = true;
        this.particleQuality = 0.75;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.renderer.shadowMap.enabled = true;
        break;
        
      case 'high':
        this.pixelRatio = Math.max(Math.min(window.devicePixelRatio, 2), 0.75);
        this.shadowMapSize = 2048;
        this.shadowQuality = 'pcf';
        this.antialiasing = true;
        this.postProcessing = true;
        this.particleQuality = 1.0;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.shadowMap.enabled = true;
        break;
    }
    
    // ใช้การตั้งค่า Pixel Ratio
    this.renderer.setPixelRatio(this.pixelRatio);
    
    // อัปเดต Shadow Map Size
    this.updateShadowMapSize();
    
    // ปรับ Particle Quality
    this.updateParticleQuality();
  }

  /**
   * อัปเดต Shadow Map Size
   */
  updateShadowMapSize() {
    this.scene.children.forEach((child) => {
      if (child.isLight && child.shadow) {
        child.shadow.mapSize.width = this.shadowMapSize;
        child.shadow.mapSize.height = this.shadowMapSize;
        child.shadow.map = null; // Force regenerate
      }
    });
  }

  /**
   * ปรับ Particle Quality
   */
  updateParticleQuality() {
    // ส่วนนี้จะถูกเรียกจาก ParticleSystem
    console.log(`🎨 Particle Quality: ${(this.particleQuality * 100).toFixed(0)}%`);
  }

  /**
   * ดึงข้อมูลสถิติ
   */
  getStats() {
    return {
      fps: this.fps,
      frameTime: this.frameTime,
      qualityLevel: this.qualityLevel,
      pixelRatio: this.pixelRatio,
      shadowMapSize: this.shadowMapSize,
      shadowQuality: this.shadowQuality,
      antialiasing: this.antialiasing,
      postProcessing: this.postProcessing,
      particleQuality: this.particleQuality,
      deviceType: this.deviceType,
    };
  }

  /**
   * หยุดการตรวจสอบประสิทธิภาพ
   */
  stop() {
    if (this.performanceInterval) {
      clearInterval(this.performanceInterval);
    }
  }
}

/**
 * Texture Compression Helper
 * ใช้ KTX2 หรือ Basis Universal สำหรับบีบอัด Texture
 */
export class TextureCompressionHelper {
  constructor(renderer) {
    this.renderer = renderer;
    this.supportedFormats = this.detectSupportedFormats();
  }

  /**
   * ตรวจจับ Compression Format ที่ Renderer รองรับ
   */
  detectSupportedFormats() {
    const gl = this.renderer.getContext();
    const formats = {
      ktx2: false,
      basis: false,
      s3tc: false,
      etc1: false,
      etc2: false,
      astc: false,
    };

    // ตรวจสอบ Extensions
    formats.s3tc = !!gl.getExtension('WEBGL_compressed_texture_s3tc');
    formats.etc1 = !!gl.getExtension('WEBGL_compressed_texture_etc1');
    formats.etc2 = !!gl.getExtension('WEBGL_compressed_texture_etc');
    formats.astc = !!gl.getExtension('WEBGL_compressed_texture_astc');

    console.log('🎨 Supported Compression Formats:', formats);
    return formats;
  }

  /**
   * เลือก Compression Format ที่เหมาะสม
   */
  getOptimalFormat() {
    if (this.supportedFormats.astc) return 'astc';
    if (this.supportedFormats.etc2) return 'etc2';
    if (this.supportedFormats.s3tc) return 's3tc';
    return 'uncompressed';
  }
}

export default {
  AdaptiveRendererSystem,
  TextureCompressionHelper,
};
