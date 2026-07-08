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
    this.selectedQualityLevel = 'auto'; // auto, high, medium, low, ultra-low
    this.activeQualityLevel = 'high'; // high, medium, low, ultra-low
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

  get qualityLevel() {
    return this.selectedQualityLevel;
  }

  set qualityLevel(value) {
    this.selectedQualityLevel = value;
    if (value !== 'auto') {
      this.activeQualityLevel = value;
    }
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
    const savedQuality = localStorage.getItem('zolos_graphics_quality');

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

    if (savedQuality) {
      this.selectedQualityLevel = savedQuality;
    } else {
      this.selectedQualityLevel = 'auto';
      localStorage.setItem('zolos_graphics_quality', this.selectedQualityLevel);
    }

    if (this.selectedQualityLevel === 'auto') {
      if (this.deviceType.isLowEnd) {
        this.activeQualityLevel = 'ultra-low';
      } else if (this.deviceType.isMidRange) {
        this.activeQualityLevel = 'medium';
      } else {
        this.activeQualityLevel = 'high';
      }
    } else {
      this.activeQualityLevel = this.selectedQualityLevel;
    }

    this.updateQualityParams();
  }

  updateQualityParams() {
    switch (this.activeQualityLevel) {
      case 'ultra-low':
        this.pixelRatio = 0.85;
        this.shadowMapSize = 256;
        this.shadowQuality = 'none';
        this.antialiasing = false;
        this.postProcessing = false;
        this.particleQuality = 0.3;
        break;

      case 'low':
        this.pixelRatio = 0.85;
        this.shadowMapSize = 512;
        this.shadowQuality = 'basic';
        this.antialiasing = false;
        this.postProcessing = false;
        this.particleQuality = 0.5;
        break;

      case 'medium':
        this.pixelRatio = 1.0;
        this.shadowMapSize = 1024;
        this.shadowQuality = 'pcf';
        this.antialiasing = false;
        this.postProcessing = true;
        this.particleQuality = 0.8;
        break;

      case 'high':
        this.pixelRatio = Math.max(Math.min(window.devicePixelRatio, 2), 1.0);
        this.shadowMapSize = 2048;
        this.shadowQuality = 'pcf-soft';
        this.antialiasing = true;
        this.postProcessing = true;
        this.particleQuality = 1.0;
        break;
    }
  }

  /**
   * ตั้งค่า Renderer
   */
  configureRenderer() {
    if (this.deviceType.isLowEnd) {
      this.renderer.antialias = false;
      this.antialiasing = false;
    }

    this.renderer.setPixelRatio(this.pixelRatio);

    if (this.activeQualityLevel === 'low') {
      this.renderer.shadowMap.type = THREE.BasicShadowMap;
    } else if (this.activeQualityLevel === 'medium') {
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
    } else if (this.activeQualityLevel === 'high') {
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    const enableShadows = (this.shadowQuality !== 'none');
    this.scene.traverse((object) => {
      if (object.isLight && object.castShadow !== undefined) {
        if (object.isDirectionalLight || object.isPointLight) {
          object.castShadow = enableShadows;
        }
      }
    });
  }

  /**
   * เริ่มการตรวจสอบประสิทธิภาพ
   */
  startPerformanceMonitoring() {
    this.performanceInterval = setInterval(() => {
      this.updatePerformanceMetrics();
      this.adaptQualityBasedOnPerformance();
    }, 2000); // ตรวจสอบทุก 2 วินาที (reduced frequency)
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

    // console.log(`📊 FPS: ${this.fps}, Frame Time: ${this.frameTime.toFixed(2)}ms`);
  }

  /**
   * ปรับคุณภาพตามประสิทธิภาพ
   */
  adaptQualityBasedOnPerformance() {
    if (this.selectedQualityLevel !== 'auto') return;

    const previousQuality = this.activeQualityLevel;

    if (this.fps < this.fpsThresholds.ultraLow) {
      this.activeQualityLevel = 'ultra-low';
    } else if (this.fps < this.fpsThresholds.low) {
      this.activeQualityLevel = 'low';
    } else if (this.fps < this.fpsThresholds.medium) {
      this.activeQualityLevel = 'medium';
    } else if (this.fps >= this.fpsThresholds.high) {
      this.activeQualityLevel = 'high';
    }

    // ถ้าคุณภาพเปลี่ยน ให้ปรับการตั้งค่า
    if (previousQuality !== this.activeQualityLevel) {
      this.applyQualitySettings();
      // Quality changed silently
    }
  }

  /**
   * ใช้การตั้งค่าคุณภาพ
   */
  applyQualitySettings() {
    if (this.selectedQualityLevel !== 'auto') {
      this.activeQualityLevel = this.selectedQualityLevel;
    }

    this.updateQualityParams();

    localStorage.setItem('zolos_graphics_quality', this.selectedQualityLevel);

    this.renderer.setPixelRatio(this.pixelRatio);

    if (this.activeQualityLevel === 'low') {
      this.renderer.shadowMap.type = THREE.BasicShadowMap;
    } else if (this.activeQualityLevel === 'medium') {
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
    } else if (this.activeQualityLevel === 'high') {
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    const enableShadows = (this.shadowQuality !== 'none');
    this.scene.traverse((object) => {
      if (object.isLight && object.castShadow !== undefined) {
        if (object.isDirectionalLight || object.isPointLight) {
          object.castShadow = enableShadows;
        }
      }
    });

    this.scene.traverse((object) => {
      if (object.isMesh && object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach((mat) => {
            mat.needsUpdate = true;
          });
        } else {
          object.material.needsUpdate = true;
        }
      }
    });

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
    // console.log(`🎨 Particle Quality: ${(this.particleQuality * 100).toFixed(0)}%`);
  }

  /**
   * ดึงข้อมูลสถิติ
   */
  getStats() {
    return {
      fps: this.fps,
      frameTime: this.frameTime,
      qualityLevel: this.selectedQualityLevel,
      activeQualityLevel: this.activeQualityLevel,
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
